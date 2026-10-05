/**
 * The two places upstream's hand-written lexer does something a Lezer
 * `@tokens` block cannot express (ADR 0007).
 *
 * Plain JavaScript on purpose: the generated parser imports this file by the
 * path written in `pikchr.grammar`, so it has to exist as JavaScript beside
 * the generated parser rather than be compiled out of `src/`. `tokens.d.ts`
 * carries its types.
 *
 * Both tokenizers are range-safe. `@lezer/markdown` hands a Script inside an
 * indented Fence to this parser as several ranges with the indentation missing
 * between them (ADR 0008), and Lezer's `InputStream` maps `peek` and
 * `acceptToken` offsets across those gaps for us — a scan therefore never sees
 * the stripped indentation, which is exactly what upstream's lexer would not
 * see either.
 */

import { ExternalTokenizer } from "@lezer/lr";
import { DotE, DotL, DotU, DotXY, MacroArgs } from "./pikchr.terms.js";

/**
 * Words that make a `.` a DOT_E (`pikchr.y:5011-5022`): every keyword-table
 * entry carrying a CP_* edge, plus `start` and `end`.
 */
const EDGE_WORDS = new Set([
  "bot",
  "bottom",
  "c",
  "center",
  "e",
  "east",
  "end",
  "left",
  "n",
  "ne",
  "north",
  "nw",
  "right",
  "s",
  "se",
  "south",
  "start",
  "sw",
  "t",
  "top",
  "w",
  "west",
]);

const DOT = 46;
const BACKSLASH = 92;
const NEWLINE = 10;
const QUOTE = 34;
const OPEN_PAREN = 40;

const isLower = (c) => c >= 97 && c <= 122;
const isUpper = (c) => c >= 65 && c <= 90;
const isDigit = (c) => c >= 48 && c <= 57;

const isNameChar = (c) =>
  isLower(c) ||
  isUpper(c) ||
  isDigit(c) ||
  c === 95 /* _ */ ||
  c === 36 /* $ */ ||
  c === 64; /* @ */

/**
 * The `.` is its own one-character token whose *kind* is decided by the word
 * that follows it: an Anchor (`.ne`), a coordinate (`.x`), a property
 * (`.wid`), or a sublist Label (`.Inner`). That word is then lexed
 * independently, so this peeks ahead but only ever accepts the one character.
 */
export const dotTokens = new ExternalTokenizer((input) => {
  if (input.next !== DOT) return;
  const after = input.peek(1);
  if (isDigit(after)) return; // `.5` is a Number, which `@tokens` handles.
  if (isUpper(after)) {
    input.acceptToken(DotU, 1);
    return;
  }
  if (!isLower(after)) return; // An error in pikchr too; let Lezer report it.
  let word = "";
  for (let i = 1; ; i++) {
    const c = input.peek(i);
    if (!isLower(c)) break;
    word += String.fromCharCode(c);
  }
  if (EDGE_WORDS.has(word)) input.acceptToken(DotE, 1);
  else if (word === "x" || word === "y") input.acceptToken(DotXY, 1);
  else input.acceptToken(DotL, 1);
});

/**
 * A Macro argument list: the raw text between balanced parentheses, which
 * upstream's parser never sees because expansion happens in its lexer. The `(`
 * must follow the Macro's name with no space between (`doc/macro.md:47-48`),
 * which is the one thing here that has to look *backwards*.
 */
export const macroArgs = new ExternalTokenizer((input) => {
  if (input.next !== OPEN_PAREN) return;
  if (!isNameChar(input.peek(-1))) return;
  let depth = 1;
  let i = 1;
  for (;;) {
    const c = input.peek(i);
    if (c < 0) return; // Unterminated: not a Macro argument list.
    if (c === NEWLINE) {
      // A `\`-newline continuation carries the list onto the next line; a
      // bare newline ends it unterminated.
      if (input.peek(i - 1) !== BACKSLASH) return;
      i++;
      continue;
    }
    if (c === QUOTE) {
      i++;
      for (;;) {
        const s = input.peek(i);
        if (s < 0) return;
        i++;
        if (s === BACKSLASH) i++;
        else if (s === QUOTE) break;
      }
      continue;
    }
    if (c === OPEN_PAREN || c === 91 /* [ */ || c === 123 /* { */) depth++;
    else if (c === 41 /* ) */ || c === 93 /* ] */ || c === 125 /* } */) {
      depth--;
      if (depth === 0) {
        input.acceptToken(MacroArgs, i + 1);
        return;
      }
    }
    i++;
  }
});
