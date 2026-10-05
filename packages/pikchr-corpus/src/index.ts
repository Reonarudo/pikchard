// Every Pikchr Script the pinned upstream check-in ships, committed rather
// than unpacked at test time (ADR 0011).
//
// It is a *conformance* corpus: it exists to prove that what upstream accepts,
// we accept — so breadth is the point, and it can only change when the pin
// moves. Refresh it with `npm run extract -w @pikchard/pikchr-corpus`, which
// needs Node and nothing else.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const corpus = fileURLToPath(new URL("../corpus/", import.meta.url));

/** Where upstream keeps a Script — its directory in the tarball. */
export const ORIGINS = ["doc", "examples", "fuzzcases", "grammar", "tests"] as const;

export type Origin = (typeof ORIGINS)[number];

export interface CorpusScript {
  /** `tests/test01.pikchr` — stable across pin bumps, and unique. */
  readonly name: string;
  readonly origin: Origin;
  /** The Script itself, verbatim: for a doc fence, its body without the fence lines. */
  readonly text: string;
}

const manifest = JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8")) as {
  checkin: string;
};

/** The pikchr check-in the corpus was extracted from. */
export const CORPUS_CHECKIN: string = manifest.checkin;

let cached: readonly CorpusScript[] | undefined;

/** Every Script in the corpus, sorted by name. */
export function corpusScripts(): readonly CorpusScript[] {
  if (!cached) {
    cached = ORIGINS.flatMap((origin) =>
      readdirSync(join(corpus, origin))
        .filter((file) => file.endsWith(".pikchr"))
        .sort()
        .map((file) => ({
          name: `${origin}/${file}`,
          origin,
          text: readFileSync(join(corpus, origin, file), "utf8"),
        })),
    );
  }
  return cached;
}
