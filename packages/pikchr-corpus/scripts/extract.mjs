#!/usr/bin/env node
//
// Rebuild corpus/ from the pinned pikchr tarball (ADR 0011).
//
// Every Pikchr Script upstream ships becomes one committed file: the four
// script directories verbatim, and every `pikchr` fence under doc/ as its
// body alone — never the surrounding prose.
//
// Node alone, deliberately: unlike gen-goldens.sh this needs no Emscripten and
// no `tar`, so refreshing the corpus after a pin bump costs nothing but a
// `node` run. Regeneration is delete-and-re-extract, so running it twice on
// the same pin must leave `git status` clean.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(pkg, "../pikchr-wasm/vendor/pikchr.lock.json");
const corpus = join(pkg, "corpus");

/** The upstream directories whose `.pikchr` files are Scripts, verbatim. */
const SCRIPT_DIRS = ["tests", "examples", "grammar", "fuzzcases"];

/**
 * A fence opens with three or more tildes or backticks and an info string
 * starting with `pikchr`, and closes on the first line starting with the same
 * run. Both delimiters take a run of any length: upstream writes `~~~~~` today
 * and nothing stops it writing ```` ```` ```` tomorrow, and a fence this
 * missed would vanish from the corpus in silence.
 */
const FENCE_OPEN = /^(~{3,}|`{3,})[ \t]*pikchr\b/;

// Importable for its parts (the fence reader has its own tests); only the
// direct `node scripts/extract.mjs` run rewrites corpus/.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

function main() {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const tarball = join(pkg, "../pikchr-wasm/vendor", lock.tarball);
  const entries = readTarGz(readFileSync(tarball));
  const root = `pikchr-${lock.short}/`;

  const scripts = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(root)) continue;
    const path = entry.name.slice(root.length);
    const slash = path.indexOf("/");
    const dir = slash < 0 ? "" : path.slice(0, slash);
    const file = path.slice(slash + 1);

    if (SCRIPT_DIRS.includes(dir) && file.endsWith(".pikchr") && !file.includes("/")) {
      scripts.push({ name: `${dir}/${file}`, text: entry.text() });
    } else if (dir === "doc" && file.endsWith(".md")) {
      // Any depth under doc/: it is flat today, but a Script upstream added in
      // a subdirectory should join the corpus rather than be skipped unseen.
      // The stem is the file's own name, so a nested doc reads the same as a
      // top-level one; two that then want one name are caught below.
      const stem = file.slice(file.lastIndexOf("/") + 1, -".md".length);
      for (const body of fencedScripts(entry.text())) {
        scripts.push({ name: `doc/${stem}-${shortHash(body)}.pikchr`, text: body });
      }
    }
  }
  scripts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const { unique, duplicates } = foldDuplicates(scripts);

  rmSync(corpus, { recursive: true, force: true });
  for (const { name, text } of unique) {
    const path = join(corpus, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }

  const counts = {};
  for (const { name } of unique) {
    const dir = name.slice(0, name.indexOf("/"));
    counts[dir] = (counts[dir] ?? 0) + 1;
  }
  writeFileSync(
    join(corpus, "manifest.json"),
    `${JSON.stringify(
      {
        $comment:
          "Written by scripts/extract.mjs. `checkin` must match packages/pikchr-wasm/vendor/pikchr.lock.json.",
        checkin: lock.checkin,
        short: lock.short,
        total: unique.length,
        counts,
        duplicateFences: duplicates,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `extract: wrote ${unique.length} Scripts from ${lock.short} (${Object.entries(counts)
      .map(([d, n]) => `${d} ${n}`)
      .join(", ")}); ${duplicates.length} repeated doc fences folded in`,
  );
}

/**
 * The bodies of every `pikchr` fence in a Markdown file, in order. A body is
 * taken verbatim, less the fence lines themselves, and ends in a newline so it
 * is a Script on the same terms as a `.pikchr` file upstream ships.
 */
export function fencedScripts(markdown) {
  const out = [];
  const lines = markdown.split("\n");
  let delimiter = null;
  let body = [];

  for (const line of lines) {
    if (delimiter === null) {
      const open = FENCE_OPEN.exec(line);
      if (open) delimiter = open[1];
      continue;
    }
    if (line.startsWith(delimiter)) {
      out.push(body.length === 0 ? "" : `${body.join("\n")}\n`);
      delimiter = null;
      body = [];
    } else {
      body.push(line);
    }
  }
  if (delimiter !== null) throw new Error("a pikchr fence is never closed");
  return out;
}

/**
 * Folds together Scripts that content-addressing has given one name, which is
 * to say Scripts that *are* the same Script: userman.md shows nine of its
 * Scripts twice over — once as `pikchr source toggle indent`, once as `pikchr
 * toggle indent` — and parsing one of them twice proves nothing.
 *
 * Two *different* Scripts wanting one name is a hash collision instead, and
 * must be fatal: silently keeping either one would drop a Script from a corpus
 * whose whole purpose is breadth.
 *
 * Takes the Scripts sorted by name, and returns them still sorted.
 */
export function foldDuplicates(scripts) {
  const unique = [];
  const duplicates = [];
  for (const script of scripts) {
    const previous = unique.at(-1);
    if (previous?.name !== script.name) {
      unique.push(script);
    } else if (previous.text === script.text) {
      duplicates.push(script.name);
    } else {
      throw new Error(`two different Scripts want the name ${script.name}`);
    }
  }
  return { unique, duplicates };
}

/**
 * Names a doc fence by what it contains, not by where it sits. The corpus is
 * regenerated by deleting it, and userman.md alone holds 71 fences, so ordinal
 * names would turn one fence inserted upstream into a 70-file rename.
 */
export function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/**
 * The files in a gzipped tar, as ustar headers and their payloads. Enough tar
 * for this one tarball — regular files, GNU long names — and no subprocess.
 */
export function readTarGz(gz) {
  const buf = gunzipSync(gz);
  const entries = [];
  let longName = null;

  for (let at = 0; at + 512 <= buf.length; ) {
    const header = buf.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = longName ?? field(header, 0, 100);
    const prefix = field(header, 345, 155);
    const size = Number.parseInt(field(header, 124, 12) || "0", 8);
    const type = String.fromCharCode(header[156]);
    const body = buf.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;

    longName = null;
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/, "");
    } else if (type === "0" || type === "\0") {
      entries.push({
        name: prefix ? `${prefix}/${name}` : name,
        text: () => body.toString("utf8"),
      });
    }
  }
  return entries;
}

function field(header, at, length) {
  return header
    .subarray(at, at + length)
    .toString("utf8")
    .replace(/\0.*$/, "");
}
