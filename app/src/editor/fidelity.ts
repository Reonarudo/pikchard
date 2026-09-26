/**
 * File fidelity: a Document goes back to disk as it came off it (#1085, and
 * the byte-for-byte acceptance criterion of #1019).
 *
 * Pikchard edits other people's files, often under version control, so an
 * edit to one Script must not show up as a diff on every line. Three things
 * are therefore observed on open and restored on write: the Document's
 * dominant line ending, its BOM, and its final newline — or the absence of
 * one, which is just as much a fact about the file.
 */

import { EditorState, type Extension } from "@codemirror/state";

const BOM = "﻿";
const CRLF = "\r\n";
const LF = "\n";

/** What a Document's bytes said, beyond the text itself. */
export interface DocumentFidelity {
  /** The text, BOM removed. */
  readonly text: string;
  /** The line ending the Document mostly uses — what it is written back with. */
  readonly lineSeparator: string;
  /** Whether the Document began with a BOM, to be re-emitted on write. */
  readonly byteOrderMark: boolean;
}

/**
 * Read a Document's raw text, separating the text from the facts about it.
 *
 * The line ending is the dominant one rather than the first one: a file that
 * is CRLF but for one stray LF is a CRLF file, and rewriting it as LF
 * throughout would be a diff on every line. LF wins a tie and an absence,
 * which is also what a brand-new Document gets.
 */
export function readDocument(raw: string): DocumentFidelity {
  const byteOrderMark = raw.startsWith(BOM);
  const text = byteOrderMark ? raw.slice(BOM.length) : raw;

  const crlf = text.split(CRLF).length - 1;
  const lf = text.split(LF).length - 1 - crlf;

  return { text, lineSeparator: crlf > lf ? CRLF : LF, byteOrderMark };
}

/**
 * The editor configuration a Document's fidelity implies.
 *
 * `lineSeparator` is the whole of it, and it does more than pick a separator
 * for new lines: CodeMirror then splits lines on that sequence *alone*, so in
 * a CRLF Document a lone LF is an ordinary character rather than a line
 * break, and survives the round trip instead of being normalised away.
 */
export function fidelityExtension(document: DocumentFidelity): Extension {
  return EditorState.lineSeparator.of(document.lineSeparator);
}

/**
 * The Document's text as the editor now holds it, joined with the Document's
 * own line ending.
 *
 * `Text.toString()` always joins with LF, which would silently convert a CRLF
 * Document on every save; this is the only way the text should ever leave the
 * editor.
 */
export function documentText(state: EditorState): string {
  const lineSeparator = state.facet(EditorState.lineSeparator) ?? LF;
  return state.doc.sliceString(0, state.doc.length, lineSeparator);
}

/** The bytes to write: the text, with the BOM the Document arrived with. */
export function writeDocument(text: string, document: DocumentFidelity): string {
  return document.byteOrderMark ? BOM + text : text;
}
