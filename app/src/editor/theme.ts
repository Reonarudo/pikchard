/**
 * How the editor looks: the app's own theme tokens, and the tint that says
 * which Script is Active (#1085).
 *
 * Both themes come from the CSS custom properties the shell already defines,
 * so switching the app's theme switches the editor with it and there is no
 * second palette to keep in step. The editor is a normal DOM component, not
 * ShadowRoot-mounted — a deliberate choice recorded in ADR 0009.
 */

import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { activeScript } from "../document/scripts.js";
import { isMarkdownDocument } from "./language.js";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    fontSize: "13px",
  },
  ".cm-content": {
    // The shell's own mono stack, so the editor and every other monospaced
    // surface — the Render Error banner — are the same face (#1022).
    fontFamily: "var(--font-mono)",
    caretColor: "var(--fg)",
    padding: "0.75rem 0",
  },
  // The cursor CodeMirror draws itself: `drawSelection` hides the native caret, so
  // `caretColor` above never shows, and the base theme's cursor is plain black —
  // invisible on the dark background (#1022). The drop cursor is the same line.
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)" },
  // The editor's focus is its own caret and selection, which are visible in both
  // themes; the app-wide `:focus-visible` ring would sit around the whole pane.
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--panel-2)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--panel)",
    color: "var(--fg)",
    opacity: 0.6,
    border: "none",
    borderRight: "1px solid var(--rule)",
  },
  // The Active Script, tinted so it is obvious which of a Markdown
  // Document's Scripts the Preview is showing.
  ".cm-activeScript": { backgroundColor: "var(--active-script)" },
  // The matched pair, and the bracket that has no partner. Custom properties
  // for the same reason as everything else here, and only while the editor is
  // focused, which is CodeMirror's own rule: a blurred editor holding a
  // highlight the cursor has left behind says nothing.
  //
  // An unpartnered bracket is not a Render Error and not a Lint, so it gets
  // its own colour rather than borrowing the error palette.
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--bracket-match)" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--bracket-nonmatch)" },
});

const activeScriptLine = Decoration.line({ class: "cm-activeScript" });

/**
 * A line decoration over each line of the Active Script's Fence body.
 *
 * Only in a Markdown Document: a `.pikchr` Document is one Script from top to
 * bottom, and tinting all of it would say nothing. An empty Fence has no body
 * line to tint, and gets nothing.
 */
function tint(state: EditorState): DecorationSet {
  if (!isMarkdownDocument(state)) return Decoration.none;
  const script = activeScript(state);
  if (!script || script.span.from === script.span.to) return Decoration.none;

  const lines = [];
  const first = state.doc.lineAt(script.span.from).number;
  // `span.to` is the start of the closing Fence line, so the body's last
  // character — its final newline — is the last position that is the Script.
  const last = state.doc.lineAt(script.span.to - 1).number;
  for (let number = first; number <= last; number++) {
    lines.push(activeScriptLine.range(state.doc.line(number).from));
  }
  return Decoration.set(lines);
}

/**
 * The tint, recomputed when the Document, the parse or the cursor moves —
 * the cursor included, because that is what makes a Script Active.
 */
export const activeScriptTint = StateField.define<DecorationSet>({
  create: tint,
  update(decorations, transaction) {
    const moved =
      transaction.startState.selection.main.head !== transaction.state.selection.main.head;
    const reparsed = syntaxTree(transaction.state) !== syntaxTree(transaction.startState);
    return transaction.docChanged || moved || reparsed ? tint(transaction.state) : decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
