/**
 * Where a Render Error is, in the Document the user is looking at (#1017).
 *
 * A Render Error's Span arrives — and is stored — in *Script* offsets, because
 * a Render is a function of its Script alone and those offsets cannot drift.
 * Editing the prose above a broken Fence moves the Fence without changing the
 * Script, so a Document offset kept in the store would quietly start pointing
 * at the wrong line. The conversion therefore happens here, at each point of
 * use, from the projection the editor publishes.
 */

import type { RenderError, Span } from "@pikchard/pikchr-wasm";
import type { ScriptProjection } from "../document/projection.js";

/** A one-based line and column in the Document. */
export interface Position {
  readonly line: number;
  readonly col: number;
}

/**
 * The error's Span in Document offsets — what a CodeMirror diagnostic wants.
 *
 * `span.from + offset` and nothing else: a Script is a contiguous stretch of
 * its Document, taken verbatim and never de-indented.
 *
 * The result is kept inside the Script, and widened to one character where
 * Pikchr gave an empty one, because an empty range underlines nothing. At the
 * very end of a Script there is nothing ahead to widen into, so it widens
 * backwards instead — underlining the Script's last character rather than the
 * closing Fence line, which is not the user's text at all.
 */
export function documentSpan(projection: ScriptProjection, error: RenderError): Span | null {
  const script = projection.span;
  if (script === null) return null;

  const from = Math.min(script.from + error.span.from, script.to);
  const to = Math.min(script.from + error.span.to, script.to);
  if (from < to) return { from, to };
  if (from < script.to) return { from, to: from + 1 };
  return { from: Math.max(script.from, from - 1), to: script.to };
}

/**
 * The error's position in the *Document* — the line of the file, not of the
 * Fence, which is the whole point of the Story's third criterion.
 *
 * The line is the Script's starting line plus the newlines before the offset.
 * The column needs no correction at all: a Script begins at the start of a
 * line, so its columns are already the Document's columns — an indented Fence
 * keeps its indentation inside the Script text, which is what makes this true.
 */
export function errorPosition(projection: ScriptProjection, error: RenderError): Position {
  const before = projection.text.slice(0, error.span.from);
  return {
    line: projection.startLine + (before.match(/\n/g)?.length ?? 0),
    col: before.length - before.lastIndexOf("\n"),
  };
}

/** How the position reads in the banner and the status bar: `3:5`. */
export function formatPosition({ line, col }: Position): string {
  return `${line}:${col}`;
}
