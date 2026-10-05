// Writes `parser/pikchr.js` and `parser/pikchr.terms.js` from
// `parser/pikchr.grammar`.
//
// The generated parser is committed, for the same reason the Emscripten build
// is (ADR 0005): the tests and the app import it directly, so it has to exist
// without a build step having run first. `grammar.test.ts` regenerates it in
// memory and fails when the committed file has drifted, which is what keeps
// the artifact honest.
//
// Usage: npm run build:grammar -w @pikchard/lang-pikchr

import { writeFileSync } from "node:fs";
import { generate, PARSER_FILE, TERMS_FILE } from "./grammar.mjs";

const { parser, terms } = generate();

writeFileSync(PARSER_FILE, parser);
writeFileSync(TERMS_FILE, terms);

console.log(`build-grammar: wrote ${parser.length} bytes of parser, ${terms.length} of terms`);
