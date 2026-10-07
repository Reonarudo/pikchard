/**
 * Pikchr as a CodeMirror 6 language (ADR 0002).
 *
 * `pikchrLanguage` is the language on its own — what `@codemirror/lang-markdown`
 * nests inside a Fence (ADR 0008). `pikchr()` is the `LanguageSupport` an
 * editor over a `.pikchr` Document installs directly.
 */

import {
  delimitedIndent,
  foldNodeProp,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
} from "@codemirror/language";
import { parser } from "../parser/pikchr.js";
import { pikchrHighlighting } from "./highlight.js";

export const pikchrLanguage = LRLanguage.define({
  name: "pikchr",
  parser: parser.configure({
    props: [
      pikchrHighlighting,
      // A Sublist and a Macro body are the only things a Script nests, and
      // both are brace- or bracket-delimited, so the standard rule is the
      // whole rule.
      indentNodeProp.add({
        Sublist: delimitedIndent({ closing: "]" }),
        MacroBody: delimitedIndent({ closing: "}" }),
      }),
      foldNodeProp.add({
        Sublist: (node) => ({ from: node.from + 1, to: node.to - 1 }),
        MacroBody: (node) => ({ from: node.from + 1, to: node.to - 1 }),
      }),
    ],
  }),
  languageData: {
    // Pikchr has three comment syntaxes; `#` is the one its own documentation
    // uses, so it is the one Toggle Comment produces.
    commentTokens: { line: "#", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*[\]}]$/,
  },
});

/** Pikchr for an editor whose whole Document is one Script. */
export function pikchr(): LanguageSupport {
  return new LanguageSupport(pikchrLanguage);
}
