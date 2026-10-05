/**
 * Pikchr language support for CodeMirror 6 (ADR 0002, ADR 0007).
 *
 * One Lezer grammar feeds everything: highlighting, the Spans the Script ↔
 * Diagram map needs, the Symbols completion and hover will read, and the error
 * nodes Lints start from.
 */

export { parser } from "../parser/pikchr.js";
export { pikchrHighlighting } from "./highlight.js";
export { DIRECTIONS, OBJECT_CLASSES, STATEMENT_KEYWORDS } from "./keywords.js";
export { pikchr, pikchrLanguage } from "./language.js";
export type { Span, Symbol, SymbolKind } from "./tree.js";
export { errorSpans, parseScript, statementAt, symbols } from "./tree.js";
