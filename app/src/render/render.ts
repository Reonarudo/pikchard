/**
 * What a Render leaves behind: the last Diagram that came out, and the error
 * the current text comes back with (#1086).
 *
 * Two slots, and all four of their combinations are real — good and fresh,
 * good but the current text fails, never rendered, nothing to render. The
 * Render itself is synchronous and hard-bounded (#1016), so there is no Render
 * in flight to model, nothing to cancel, and no transient "rendering" state.
 */

import type { RenderError, Renderer } from "@pikchard/pikchr-wasm";
import type { Theme } from "../store.js";

/** The SVG produced by a successful Render, at the size Pikchr computed for it. */
export interface Diagram {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

export interface RenderSlice {
  /**
   * The last successful Render of the Active Script, and the Script text it
   * was made from — always in the current theme.
   *
   * The text is kept for one reason: a theme toggle re-renders it, because
   * `darkMode` is an input to Pikchr and not a style over its output. It is
   * deliberately *not* folded into `Diagram`, which is the glossary's term for
   * the SVG alone.
   */
  readonly lastGood: { readonly diagram: Diagram; readonly script: string } | null;
  /** The most recent Render's error, in *Script* offsets. Null when it succeeded. */
  readonly error: RenderError | null;
  /** How long the most recent Render of the Active Script took, in ms. */
  readonly elapsedMs: number | null;
}

/** Before the first Render — the module still loading, or no Active Script. */
export const NOT_RENDERED: RenderSlice = { lastGood: null, error: null, elapsedMs: null };

/**
 * Render a Script, keeping the previous slice's Diagram through a failure.
 *
 * Passing `NOT_RENDERED` as `previous` is how a *switch* of Active Script is
 * expressed: the Diagram on screen must always belong to the Active Script,
 * possibly out of date, never to another one.
 */
export function renderScript(
  renderer: Renderer,
  script: string,
  theme: Theme,
  previous: RenderSlice,
): RenderSlice {
  const started = performance.now();
  const result = renderer.render(script, { darkMode: theme === "dark" });
  const elapsedMs = performance.now() - started;

  if (!result.ok) {
    return { lastGood: previous.lastGood, error: result.error, elapsedMs };
  }
  const { svg, width, height } = result;
  return { lastGood: { diagram: { svg, width, height }, script }, error: null, elapsedMs };
}

/**
 * Re-render the kept Diagram for a new theme.
 *
 * Pikchr inverts the strokes itself, so a Diagram belongs to one theme and a
 * toggle is a Render, not a repaint. This Render cannot fail — its Script
 * succeeded once already — and a failure is therefore treated as nothing
 * happening rather than as news to report.
 *
 * `elapsedMs` follows only when the Active Script is what was re-rendered.
 * While the current text has an error, the kept Diagram is older than the
 * Script being edited, and timing it would answer the status bar's question
 * with a measurement of something else.
 */
export function rerenderForTheme(
  renderer: Renderer,
  previous: RenderSlice,
  theme: Theme,
): RenderSlice {
  if (previous.lastGood === null) return previous;

  const next = renderScript(renderer, previous.lastGood.script, theme, previous);
  if (next.lastGood === null) return previous;
  return {
    lastGood: next.lastGood,
    error: previous.error,
    elapsedMs: previous.error === null ? next.elapsedMs : previous.elapsedMs,
  };
}
