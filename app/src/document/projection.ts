/**
 * What the rest of the app is told about the Scripts (#1042).
 *
 * `EditorState` is the single source of truth for the Document's text, so
 * what leaves the editor is a projection and never a second copy: how many
 * Scripts there are, which one is Active, and that one's Span and text. The
 * Preview needs the Active Script's text to render; the status bar needs the
 * count and the index; nothing outside needs the prose.
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { activeScriptIndex, type Span, scriptsOf } from "./scripts.js";

export interface ScriptProjection {
  /** How many Scripts the Document has. */
  readonly count: number;
  /** Which one is Active, or `null` when the Document has no Scripts. */
  readonly activeIndex: number | null;
  /** The Active Script's Span in the Document, for mapping Diagnostics back. */
  readonly span: Span | null;
  /** The Active Script's text — what gets rendered. Empty when there is none. */
  readonly text: string;
  /**
   * Which line of the *Document* the Active Script's first line is, counting
   * from 1. Zero when there is no Active Script.
   *
   * This is what turns a Render Error's Script offset into a Document
   * `line:col` (#1017) without anything outside the editor holding a second
   * copy of the Document's text. It works because a Script always begins at
   * the start of a line — the line after its opening Fence, or line 1 of a
   * Pikchr Document — so a Script's columns are its Document's columns, and
   * only the line numbers are shifted.
   */
  readonly startLine: number;
}

/** A Document with no Scripts: what a prose-only Markdown file projects to. */
export const NO_SCRIPTS: ScriptProjection = {
  count: 0,
  activeIndex: null,
  span: null,
  text: "",
  startLine: 0,
};

export function projectScripts(state: EditorState): ScriptProjection {
  // Derived once and read four ways: `scriptsOf` re-walks the tree whenever
  // the field is not installed, which is exactly the case in tests.
  const scripts = scriptsOf(state);
  const activeIndex = activeScriptIndex(state);
  const script = activeIndex === null ? undefined : scripts[activeIndex];
  if (!script) return NO_SCRIPTS;

  return {
    count: scripts.length,
    activeIndex,
    span: script.span,
    text: script.text,
    startLine: state.doc.lineAt(script.span.from).number,
  };
}

/**
 * Whether two projections say the same thing.
 *
 * Every keystroke produces a transaction, but most of them leave the
 * projection identical — typing in the prose between two Fences changes
 * neither Script. Comparing here keeps those out of the store, and out of
 * React.
 */
export function sameProjection(a: ScriptProjection, b: ScriptProjection): boolean {
  return (
    a.count === b.count &&
    a.activeIndex === b.activeIndex &&
    a.text === b.text &&
    // A same-length edit above a Fence — a character replaced by a newline —
    // moves the Script's line without moving its offset.
    a.startLine === b.startLine &&
    a.span?.from === b.span?.from &&
    a.span?.to === b.span?.to
  );
}

/**
 * Publish the projection whenever it changes — and only then.
 *
 * A Span moves when text before it is edited even though the Script itself
 * did not change, so this deliberately watches the whole projection rather
 * than the Active Script's text alone: a Diagnostic has to land in the right
 * place either way.
 */
export function publishProjection(publish: (projection: ScriptProjection) => void): Extension {
  let last: ScriptProjection | null = null;
  return EditorView.updateListener.of((update) => {
    // A finished background parse arrives as a transaction that changed
    // neither the Document nor the selection, and it is the one that can turn
    // up Fences nobody had seen yet — so the tree is watched too.
    const reparsed = syntaxTree(update.state) !== syntaxTree(update.startState);
    if (!update.docChanged && !update.selectionSet && !reparsed) return;

    const projection = projectScripts(update.state);
    if (last && sameProjection(last, projection)) return;
    last = projection;
    publish(projection);
  });
}
