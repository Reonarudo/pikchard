/**
 * Editor Commands (#1085; the registry and the binding table are #1053 and
 * #1023).
 */

import type { EditorState, StateCommand } from "@codemirror/state";
import { EditorState as State } from "@codemirror/state";
import { isMarkdownDocument } from "./language.js";

const FENCE = "```pikchr";
const FENCE_CLOSE = "```";

/** Whether this Document can hold a Fence at all — only Markdown can. */
export function canInsertFence(state: EditorState): boolean {
  return isMarkdownDocument(state);
}

/**
 * Insert Pikchr Fence: an empty Fence on its own lines at the cursor, with
 * the cursor left inside it.
 *
 * "On its own lines" is the whole difficulty. The cursor can be mid-sentence,
 * at the start of a line, on the blank line after another Fence or in an
 * empty Document, and a Fence has to end up separated from its surroundings
 * in every one of them — without gratuitous blank lines where the separation
 * is already there.
 *
 * Disabled in a Pikchr Document, where the whole file is already one Script
 * and a Fence would be text.
 */
export const insertFence: StateCommand = ({ state, dispatch }) => {
  if (!canInsertFence(state)) return false;

  // At the end of the selection rather than at its head: inserting a Fence
  // never destroys what is selected.
  const at = state.selection.main.to;
  const line = state.doc.lineAt(at);
  const before = state.doc.sliceString(line.from, at);
  const after = state.doc.sliceString(at, line.to);

  const lines: string[] = [];
  if (before !== "") {
    // Break out of the line the cursor is in, and leave a blank line.
    lines.push("", "");
  } else if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== "") {
    // Already at a line start, but hard up against the prose — or the Fence —
    // above it.
    lines.push("");
  }

  const body = lines.push(FENCE, "", FENCE_CLOSE) - 2;
  // The closing Fence always ends its line; text that followed the cursor
  // also gets a blank line of its own.
  lines.push(...(after === "" ? [""] : ["", ""]));

  // Positions, not string length: with a CRLF Document a line break is one
  // position but two characters, so the cursor has to be counted in lines.
  const cursor = lines.slice(0, body).reduce((offset, text) => offset + text.length + 1, at);

  dispatch(
    state.update({
      changes: { from: at, insert: lines.join(state.facet(State.lineSeparator) ?? "\n") },
      selection: { anchor: cursor },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
