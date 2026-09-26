import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the extractor is build tooling, plain JS with no types.
import { fencedScripts, foldDuplicates, readTarGz, shortHash } from "../scripts/extract.mjs";

interface Named {
  name: string;
  text: string;
}

const fences = fencedScripts as (markdown: string) => string[];
const hash = shortHash as (text: string) => string;
const readTar = readTarGz as (gz: Buffer) => { name: string; text: () => string }[];
const fold = foldDuplicates as (scripts: Named[]) => { unique: Named[]; duplicates: string[] };

describe("reading pikchr fences out of Markdown", () => {
  it("takes the body and leaves the prose", () => {
    expect(
      fences(["Some prose.", "```pikchr", "box", "arrow", "```", "More prose."].join("\n")),
    ).toEqual(["box\narrow\n"]);
  });

  it("reads tilde fences as well as backtick ones", () => {
    expect(fences(["~~~ pikchr", "circle", "~~~"].join("\n"))).toEqual(["circle\n"]);
  });

  it("ignores fences in any other language", () => {
    expect(fences(["```c", "int main(void){}", "```"].join("\n"))).toEqual([]);
  });

  it("keeps a backtick fence nested inside a tilde fence as content", () => {
    // Upstream's docs show Markdown that itself contains a pikchr fence; the
    // inner delimiter must not close the outer one.
    expect(fences(["~~~~ pikchr", "box", "```", "circle", "~~~~"].join("\n"))).toEqual([
      "box\n```\ncircle\n",
    ]);
  });

  it("reads an info string with more than the language on it", () => {
    expect(fences(["```pikchr toggle", "box", "```"].join("\n"))).toEqual(["box\n"]);
  });

  it("reads a run of backticks longer than three", () => {
    // Upstream writes `~~~~~` today; a four-backtick fence it adds tomorrow
    // must join the corpus rather than be skipped in silence.
    expect(fences(["````pikchr", "box", "````"].join("\n"))).toEqual(["box\n"]);
  });

  it("does not let a shorter run close a longer fence", () => {
    expect(fences(["`````pikchr", "box", "```", "circle", "`````"].join("\n"))).toEqual([
      "box\n```\ncircle\n",
    ]);
  });

  it("does not mistake a longer word for the language", () => {
    expect(fences(["```pikchrx", "box", "```"].join("\n"))).toEqual([]);
  });

  it("refuses a fence that is never closed", () => {
    expect(() => fences(["```pikchr", "box"].join("\n"))).toThrow(/never closed/);
  });
});

describe("naming a fence by its content", () => {
  it("gives the same Script the same name, and different Scripts different ones", () => {
    expect(hash("box\n")).toBe(hash("box\n"));
    expect(hash("box\n")).not.toBe(hash("circle\n"));
    expect(hash("box\n")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("folding Scripts that content-addressing named alike", () => {
  it("keeps a Script that appears twice once, and says which", () => {
    // userman.md shows nine of its Scripts twice over, as `pikchr source
    // toggle indent` and again as `pikchr toggle indent`.
    const { unique, duplicates } = fold([
      { name: "doc/userman-aaaaaaaa.pikchr", text: "box\n" },
      { name: "doc/userman-aaaaaaaa.pikchr", text: "box\n" },
      { name: "doc/userman-bbbbbbbb.pikchr", text: "circle\n" },
    ]);

    expect(unique.map((s) => s.name)).toEqual([
      "doc/userman-aaaaaaaa.pikchr",
      "doc/userman-bbbbbbbb.pikchr",
    ]);
    expect(duplicates).toEqual(["doc/userman-aaaaaaaa.pikchr"]);
  });

  it("leaves Scripts with distinct names alone", () => {
    const scripts = [
      { name: "tests/test01.pikchr", text: "box\n" },
      { name: "tests/test02.pikchr", text: "box\n" },
    ];

    expect(fold(scripts)).toEqual({ unique: scripts, duplicates: [] });
  });

  it("refuses two different Scripts under one name", () => {
    // A hash collision. Keeping either would drop a Script from a corpus
    // whose whole point is breadth, so it has to stop the extraction.
    expect(() =>
      fold([
        { name: "doc/userman-aaaaaaaa.pikchr", text: "box\n" },
        { name: "doc/userman-aaaaaaaa.pikchr", text: "circle\n" },
      ]),
    ).toThrow(/two different Scripts/);
  });
});

describe("reading a gzipped tar without a subprocess", () => {
  // Against a tar built here, not the vendored one: the whole point of
  // committing the corpus (ADR 0011) is that `npm test` never unpacks 1.3 MB.

  it("finds a file and its contents", () => {
    const tar = tarOf([{ name: "pikchr-a7f1c35b/tests/test01.pikchr", body: "box\n" }]);

    const entries = readTar(tar);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("pikchr-a7f1c35b/tests/test01.pikchr");
    expect(entries[0]?.text()).toBe("box\n");
  });

  it("reads a file whose body does not fill its last block", () => {
    // Bodies are padded to 512 bytes; reading the padding back as content
    // would append NULs to every Script that is not an exact multiple.
    const tar = tarOf([{ name: "a", body: "x".repeat(513) }]);

    expect(readTar(tar)[0]?.text()).toBe("x".repeat(513));
  });

  it("reads the files after it too", () => {
    const tar = tarOf([
      { name: "one", body: "1\n" },
      { name: "two", body: "2".repeat(1000) },
      { name: "three", body: "3\n" },
    ]);

    expect(readTar(tar).map((e) => e.name)).toEqual(["one", "two", "three"]);
    expect(readTar(tar)[2]?.text()).toBe("3\n");
  });

  it("skips directories, keeping only the files", () => {
    const tar = tarOf([
      { name: "doc/", body: "", type: "5" },
      { name: "doc/userman.md", body: "# Pikchr\n" },
    ]);

    expect(readTar(tar).map((e) => e.name)).toEqual(["doc/userman.md"]);
  });

  it("joins a ustar prefix back onto its name", () => {
    const tar = tarOf([{ name: "userman.md", body: "x\n", prefix: "pikchr-a7f1c35b/doc" }]);

    expect(readTar(tar)[0]?.name).toBe("pikchr-a7f1c35b/doc/userman.md");
  });

  it("takes a GNU long name from the entry that carries it", () => {
    const long = `pikchr-a7f1c35b/doc/${"n".repeat(120)}.md`;
    const tar = tarOf([
      { name: "././@LongLink", body: `${long}\0`, type: "L" },
      { name: long.slice(0, 100), body: "x\n" },
    ]);

    expect(readTar(tar).map((e) => e.name)).toEqual([long]);
  });
});

/** A gzipped ustar archive, for the reader to read back. */
function tarOf(files: { name: string; body: string; type?: string; prefix?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const { name, body, type = "0", prefix = "" } of files) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write("000644 \0", 100, 8, "utf8");
    header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")} `, 124, 12, "utf8");
    header.write(type, 156, 1, "utf8");
    header.write("ustar\0" + "00", 257, 8, "utf8");
    header.write(prefix, 345, 155, "utf8");

    const payload = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
    payload.write(body, 0, "utf8");
    blocks.push(header, payload);
  }
  blocks.push(Buffer.alloc(1024)); // the two empty blocks that end an archive
  return gzipSync(Buffer.concat(blocks));
}
