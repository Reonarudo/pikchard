// Generating the parser from `parser/pikchr.grammar`, in memory.
//
// Shared between `build-grammar.mjs`, which writes the result to disk, and
// `grammar.test.ts`, which compares the committed files against a fresh run
// and fails when they have drifted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildParserFile } from "@lezer/generator";

const parserDir = fileURLToPath(new URL("../parser/", import.meta.url));

export const GRAMMAR_FILE = `${parserDir}pikchr.grammar`;
export const PARSER_FILE = `${parserDir}pikchr.js`;
export const TERMS_FILE = `${parserDir}pikchr.terms.js`;

/** The grammar source, as committed. */
export function readGrammar() {
  return readFileSync(GRAMMAR_FILE, "utf8");
}

/**
 * Compile the grammar. `moduleStyle: "es"` and the `.terms.js` split are what
 * `lezer-generator` itself emits, so the committed files stay diffable against
 * an upstream-shaped build.
 */
export function generate() {
  const { parser, terms } = buildParserFile(readGrammar(), {
    fileName: GRAMMAR_FILE,
    moduleStyle: "es",
    exportName: "parser",
  });
  return { parser, terms };
}
