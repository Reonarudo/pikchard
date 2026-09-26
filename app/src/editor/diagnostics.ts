/**
 * The Render Error as a CodeMirror Diagnostic (#1017).
 *
 * It arrives here already converted to Document offsets — and already widened
 * to a range that can be seen — because the store keeps it in Script offsets
 * and `documentSpan` is where the Script's own bounds are known. What is left
 * is the one thing this module knows and that one does not: how long the
 * Document is.
 */

import type { Diagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { Span } from "@pikchard/pikchr-wasm";

/** A Render Error, in Document offsets. */
export interface EditorDiagnostic {
  readonly span: Span;
  readonly message: string;
}

/**
 * The Diagnostic set for a Render Error — one, or none: Pikchr stops at the
 * first error and never reports more than one per Render.
 *
 * Pikchr's message is carried verbatim. It is the same wording the user will
 * meet in Pikchr's own documentation, and rewording it here would put our
 * words between them and the language they are learning (#1100).
 */
export function renderErrorDiagnostics(
  state: EditorState,
  error: EditorDiagnostic | null,
): Diagnostic[] {
  if (error === null) return [];

  const length = state.doc.length;
  const from = Math.max(0, Math.min(error.span.from, length));
  const to = Math.max(from, Math.min(error.span.to, length));

  return [{ from, to, severity: "error", source: "pikchr", message: error.message }];
}
