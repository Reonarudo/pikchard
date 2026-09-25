/**
 * The Scripts of a Document, and which one is Active — read off the editor's
 * syntax tree (#1042, ADR 0008).
 *
 * This is a tree query, not a line scanner: CommonMark's awkward cases —
 * Fences indented inside lists, `~~~` nested in backticks, an unclosed Fence
 * at EOF — are `@lezer/markdown`'s problem, and we only ask it where the
 * Fences are. `EditorState` stays the single source of truth for the text;
 * nothing here keeps a second copy of the Document.
 */

import { ensureSyntaxTree, language, syntaxTree } from "@codemirror/language";
import { type EditorState, StateField } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { pikchrLanguage, type Span } from "@pikchard/lang-pikchr";
import { isPikchrInfoString } from "./fences.js";

export type { Span };

/** One Script, with where it sits in its Document. */
export interface Script {
  /**
   * The Script's Span in the Document — the Fence body, excluding the Fence
   * lines. Always contiguous and never de-indented, so a Script offset maps
   * back to the Document by `span.from + offset` and nothing else.
   */
  readonly span: Span;
  /** Exactly `doc.sliceString(span.from, span.to)` — what Pikchr renders. */
  readonly text: string;
}

/**
 * The Span of a Fence's body: from the start of the line after the opening
 * Fence line, up to the start of the closing Fence line.
 *
 * The body's last newline belongs to the body, so a Script's text is exactly
 * what the same Script would hold as a `.pikchr` file.
 *
 * Deliberately derived from the Fence *lines* rather than from the tree's
 * `CodeText` node, which starts after the indentation of the first body line
 * and so would make an indented Script's Span disagree with its own text.
 */
function fenceBody(state: EditorState, fence: SyntaxNode): Span {
  const from = Math.min(state.doc.lineAt(fence.from).to + 1, state.doc.length);

  // An unclosed Fence at EOF has only its opening `CodeMark` and runs to the
  // end of its block; a closed one ends where its closing mark's line begins.
  const closing = fence.lastChild;
  const to =
    closing?.name === "CodeMark" && closing.from > fence.from
      ? state.doc.lineAt(closing.from).from
      : fence.to;

  return { from, to: Math.max(from, to) };
}

/**
 * Every Script of the Document, in Document order.
 *
 * A Document whose language is Pikchr — `.pikchr`, `.pik`, Untitled — is one
 * Script spanning the whole file, empty file included. Any other Document is
 * Markdown, and its Scripts are its `pikchr`-tagged Fences.
 */
function deriveScripts(state: EditorState): readonly Script[] {
  const text = ({ from, to }: Span): Script => ({
    span: { from, to },
    text: state.doc.sliceString(from, to),
  });

  if (state.facet(language) === pikchrLanguage) {
    return [text({ from: 0, to: state.doc.length })];
  }

  const scripts: Script[] = [];
  documentTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      const fence = node.node;
      const info = fence.getChild("CodeInfo");
      if (!info || !isPikchrInfoString(state.doc.sliceString(info.from, info.to))) return;
      scripts.push(text(fenceBody(state, fence)));
    },
  });
  return scripts;
}

/**
 * A parse of the *whole* Document, not just of what is on screen.
 *
 * CodeMirror parses lazily, to the viewport and a little beyond, because
 * that is all highlighting needs. The Script list is not a view concern —
 * "this Document has 9 Scripts" must not depend on where the window happens
 * to be scrolled — so the parse is forced to the end of the Document.
 *
 * The budget bounds the stall on a very large file; the parse is incremental,
 * so only the first one costs anything, and a parse that overruns leaves a
 * short list that the next transaction corrects.
 */
const PARSE_BUDGET_MS = 150;

function documentTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS) ?? syntaxTree(state);
}

/**
 * The Scripts, recomputed whenever the Document or its parse changes.
 *
 * The tree itself is incremental, so this re-reads a tree rather than
 * re-parsing one; a Document is a handful of Fences, and walking them is
 * cheaper than tracking their identities across an edit would be.
 */
const scriptsField = StateField.define<readonly Script[]>({
  create: deriveScripts,
  update(scripts, transaction) {
    const reparsed = syntaxTree(transaction.state) !== syntaxTree(transaction.startState);
    return transaction.docChanged || reparsed ? deriveScripts(transaction.state) : scripts;
  },
});

/** Install the Script derivation. The editor (#1085) adds this once. */
export function scripts() {
  return [scriptsField];
}

/** The Document's Scripts. Works with or without the field installed. */
export function scriptsOf(state: EditorState): readonly Script[] {
  return state.field(scriptsField, false) ?? deriveScripts(state);
}

/**
 * Which Script the cursor is in, or `null` when the Document has none.
 *
 * The cursor is inside a Script at either end of its Span, so typing at the
 * very start or end of a Fence body keeps that Script Active. In the prose
 * between Fences it is the nearest Script before the cursor; before the first
 * Script it is that first Script, so a Document with Scripts always has one
 * Active.
 *
 * Identity is positional, and only positional: this asks where the cursor is
 * now, never which Script used to be Active. That is what makes deleting a
 * Fence, or untagging it, a non-event rather than a dangling reference.
 */
export function activeScriptIndex(state: EditorState): number | null {
  const scripts = scriptsOf(state);
  if (scripts.length === 0) return null;

  const cursor = state.selection.main.head;
  let index = 0;
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i] as Script;
    if (script.span.from <= cursor) index = i;
    if (script.span.from <= cursor && cursor <= script.span.to) return i;
  }
  return index;
}

/** The Active Script itself. */
export function activeScript(state: EditorState): Script | null {
  const index = activeScriptIndex(state);
  return index === null ? null : (scriptsOf(state)[index] ?? null);
}
