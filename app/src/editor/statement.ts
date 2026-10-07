/**
 * The statement behind an Object in the Diagram (#1029).
 *
 * A Diagram's `data-pik` offset names its statement's first token — the Label
 * if it has one, `[` for a container, the call site for a Macro (ADR 0005). The
 * editor's own tree turns that into the statement's Span, and reads the Pikchr
 * nested in a Markdown Fence as readily as a `.pikchr` Document's.
 */

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { type Span, scriptsOf } from "../document/scripts.js";

/** How long to wait for the parser to reach the offset, in ms. */
const PARSE_BUDGET = 100;

/**
 * The Span of the innermost statement at `offset`, a Document offset.
 *
 * `side` says which way to look: forward by default, because a Diagram's
 * offset is where its statement *starts*, and looking back would land in
 * whatever came before it. A cursor can also sit at a statement's end, which
 * is what looking back is for.
 */
export function statementSpanAt(state: EditorState, offset: number, side: 1 | -1 = 1): Span | null {
  // The whole Document, not just up to the offset: a tree parsed only that far
  // can end a statement where the parse stopped, and `A: box` comes back as `A:`.
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET) ?? syntaxTree(state);
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(offset, side);
    node;
    node = node.parent
  ) {
    if (node.name === "Statement") return { from: node.from, to: node.to };
  }
  return null;
}

/**
 * The start of the statement the cursor at `position` is in, as an offset into
 * its Script — the `data-pik` the Diagram gives that statement's Objects
 * (#1029). `null` in the prose, between statements, and outside every Script.
 */
export function statementAtCursor(state: EditorState, position: number): number | null {
  const script = scriptsOf(state).find(({ span }) => position >= span.from && position <= span.to);
  if (!script) return null;
  const span = statementSpanAt(state, position, 1) ?? statementSpanAt(state, position, -1);
  if (!span || span.from < script.span.from || span.to > script.span.to) return null;
  return span.from - script.span.from;
}

/**
 * Select the statement at `offset` and bring it into view. The cursor goes to
 * the offset when no statement is there, which a Diagram that matches its
 * Script never produces.
 */
export function selectStatement(view: EditorView, offset: number): void {
  const span = statementSpanAt(view.state, offset);
  view.dispatch({
    selection: span ? { anchor: span.from, head: span.to } : { anchor: offset },
    scrollIntoView: true,
  });
  view.focus();
}
