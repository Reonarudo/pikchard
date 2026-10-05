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
import type { Span } from "../document/scripts.js";

/** How long to wait for the parser to reach the offset, in ms. */
const PARSE_BUDGET = 100;

/** The Span of the innermost statement at `offset`, a Document offset. */
export function statementSpanAt(state: EditorState, offset: number): Span | null {
  const tree = ensureSyntaxTree(state, offset + 1, PARSE_BUDGET) ?? syntaxTree(state);
  // Looking forward from the offset, because it is where the statement starts:
  // looking back would land in whatever came before it.
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(offset, 1);
    node;
    node = node.parent
  ) {
    if (node.name === "Statement") return { from: node.from, to: node.to };
  }
  return null;
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
