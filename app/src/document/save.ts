/**
 * Save and Save As: the Document, back to where it came from (#1020, and what
 * closed #1085's byte-for-byte criterion).
 *
 * The whole of Save's care is that a Document leaves Pikchard as it arrived —
 * same line ending, same BOM, same final newline or lack of one — so this is
 * the one place allowed to turn an `EditorState` into bytes, and it does it
 * through `fidelity`'s two functions rather than by reading the doc itself.
 *
 * The second thing it owes is the Baseline. A Save reports the text it wrote,
 * and the caller makes that the Document's Baseline — which is what clears
 * Unsaved and deletes the Draft. Before writing in place, the file is read back
 * and compared against that same Baseline: Pikchard does not watch files while
 * they are open, so this one check is the whole defence against overwriting an
 * edit made underneath it, and it is symmetric across both Platforms (#1054).
 */

import type { EditorState } from "@codemirror/state";
import type { EditorDocument } from "../editor/Editor.js";
import { documentText, writeDocument } from "../editor/fidelity.js";
import { type DocumentRef, DocumentUnreadableError, type Platform } from "../platform/types.js";

/** The Document being saved, and where it came from. */
export interface SaveTarget extends EditorDocument {
  /** Where it came from, or `null` for an Untitled Document (#1054). */
  readonly identity: DocumentRef | null;
  /** Its text as last opened or saved — what the file on disk is compared against. */
  readonly baseline: string;
}

/**
 * The extension an Untitled Document is offered.
 *
 * `languageForName` reads an extensionless Name as Pikchr, so this is the
 * extension under which the Document re-opens as the language it was just
 * being edited as.
 */
const DEFAULT_EXTENSION = ".pikchr";

/**
 * What to call the file in the dialog.
 *
 * An Untitled Document's Name is the word "Untitled" and nothing else (#1046),
 * which is a Name for a title bar rather than for a file. It matters most on
 * the download path, where there is no dialog for the user to correct it in.
 */
function suggestedName(name: string): string {
  return name.lastIndexOf(".") > 0 ? name : name + DEFAULT_EXTENSION;
}

/**
 * What became of the Save.
 *
 * `text` is what was written, and what the Document's Baseline becomes. A
 * download has none, deliberately: Pikchard never learns where the file went,
 * so the Document is left exactly as Unsaved as it was (#1054).
 */
export type SaveResult =
  | { outcome: "saved"; identity: DocumentRef; text: string }
  | { outcome: "downloaded" }
  | { outcome: "cancelled" };

/** Prompt B, asked only when the file no longer matches the Baseline (#1100). */
export type ConfirmOverwrite = (name: string) => Promise<boolean>;

/**
 * Write the Document the editor is holding, to the file it came from.
 *
 * Takes the `EditorState` and not a string: `EditorState.toString()` joins
 * with LF whatever the Document uses, so letting text out any other way is how
 * a CRLF file quietly becomes an LF one.
 *
 * Falls through to {@link saveDocumentAs} in the three cases where there is no
 * file to write back to: an Untitled Document, a Platform that cannot write in
 * place at all — Firefox and Safari, where an Identity is a display hint and
 * the downloads folder is the only destination — and a file that has since
 * been deleted, which has no changes to protect and nowhere to go.
 */
export async function saveDocument(
  platform: Platform,
  target: SaveTarget,
  state: EditorState,
  confirmOverwrite: ConfirmOverwrite,
): Promise<SaveResult> {
  if (!target.identity || !platform.capabilities.saveInPlace) {
    return saveDocumentAs(platform, target, state);
  }

  switch (await compareToBaseline(platform, target)) {
    case "gone":
      return saveDocumentAs(platform, target, state);
    case "changed":
      if (!(await confirmOverwrite(target.name))) return { outcome: "cancelled" };
      break;
    case "same":
      break;
  }

  const { text, bytes } = outgoing(target, state);
  await platform.saveDocument(target.identity, bytes);
  return { outcome: "saved", identity: target.identity, text };
}

/**
 * The Document on its way out: the text the editor holds, and the bytes that
 * text becomes.
 *
 * The one place either is produced, because producing the second any other way
 * is how a CRLF file quietly becomes an LF one.
 */
function outgoing(target: SaveTarget, state: EditorState): { text: string; bytes: string } {
  const text = documentText(state);
  return { text, bytes: writeDocument(text, target.fidelity) };
}

/**
 * Ask where to put the Document, and write it there.
 *
 * Save As in its own right, and the fallback the Save above takes. The
 * Identity it comes back with is what makes the *next* Save a write in place;
 * a download comes back without one, because there is none to have.
 *
 * **A Save As keeps the Document's own line ending and BOM** — the question the
 * first slice of #1020 left open. A Document's bytes are a fact about the
 * Document and not about its destination: a CRLF file saved under a new name is
 * still the CRLF file it was, and converting it silently would be a diff on
 * every line of the copy. The new Name is allowed to change one thing only, and
 * that is the language the editor reads it as.
 */
export async function saveDocumentAs(
  platform: Platform,
  target: SaveTarget,
  state: EditorState,
): Promise<SaveResult> {
  const { text, bytes } = outgoing(target, state);
  const result = await platform.saveDocumentAs(bytes, suggestedName(target.name));
  return result.outcome === "saved" ? { ...result, text } : result;
}

/** How the file on disk stands against the Baseline Pikchard is holding. */
type FileState = "same" | "changed" | "gone";

/**
 * Read the file back and compare it with the Baseline — as bytes, not as text,
 * so a rewrite that changed only the line endings still counts as a change.
 *
 * A file that has been deleted is `"gone"` rather than `"changed"`: there is no
 * work to overwrite, so asking would be a question about nothing. A *denial*
 * is neither, and is left to reach the caller — the Save is going to fail on
 * the same permission anyway, and saying so is better than asking about a file
 * that could not be read.
 */
async function compareToBaseline(platform: Platform, target: SaveTarget): Promise<FileState> {
  if (!target.identity) return "gone";
  try {
    const onDisk = await platform.readDocument(target.identity);
    return onDisk === writeDocument(target.baseline, target.fidelity) ? "same" : "changed";
  } catch (error) {
    if (error instanceof DocumentUnreadableError && error.reason === "missing") return "gone";
    throw error;
  }
}
