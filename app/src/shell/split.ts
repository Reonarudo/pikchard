/**
 * The editor/Preview split (#1023, #1047).
 *
 * Three things the user can do to it — drag the gutter, double-click to reset,
 * hide the editor entirely — and the first two are one number, which is why they
 * live together. The number is remembered across sessions in the webview's own
 * storage, like everything that is not a Document (ADR 0010).
 *
 * The gutter is **not a tab stop** (#1101 guard 12): dragging is a pointer
 * gesture, and the keyboard route to seeing the Diagram full-width is Mod+B, which
 * is a Command with a menu item and a toolbar button. A `role="separator"`
 * describes it for anything that asks.
 */

import { useCallback, useEffect, useState } from "react";
import { type KeyValueStore, webStorage } from "../platform/storage.js";

/** Where the gutter starts, in pixels of editor width (#1047). */
export const DEFAULT_EDITOR_WIDTH = 460;
/** Narrower than this and the editor is a column of broken lines, not an editor. */
export const MIN_EDITOR_WIDTH = 220;
/** The Preview always keeps at least this much, however wide the window is. */
const MIN_PREVIEW_WIDTH = 240;

export const SPLIT_STORAGE_KEY = "pikchard.split";

export interface Split {
  /** The editor's width in pixels, or 0 while it is hidden. */
  readonly editorWidth: number;
  readonly editorVisible: boolean;
  readonly toggleEditor: () => void;
  /** Drag: the gutter hands over the pointer's x, and this clamps it. */
  readonly dragTo: (x: number, available: number) => void;
  /** Double-click: back to the default, which is what a reset means here. */
  readonly reset: () => void;
}

/** Keep the editor usable and leave the Preview something, whatever is dragged. */
export function clampEditorWidth(width: number, available: number): number {
  const most = Math.max(MIN_EDITOR_WIDTH, available - MIN_PREVIEW_WIDTH);
  return Math.round(Math.min(Math.max(width, MIN_EDITOR_WIDTH), most));
}

export function readEditorWidth(storage: KeyValueStore | null = webStorage()): number {
  const kept = Number(storage?.getItem(SPLIT_STORAGE_KEY));
  // Anything that is not a usable number reads as the default, which is the same
  // answer as "nothing kept yet" and the only one that cannot break a launch.
  return Number.isFinite(kept) && kept >= MIN_EDITOR_WIDTH ? kept : DEFAULT_EDITOR_WIDTH;
}

export function writeEditorWidth(
  width: number,
  storage: KeyValueStore | null = webStorage(),
): void {
  storage?.setItem(SPLIT_STORAGE_KEY, String(Math.round(width)));
}

export function useSplit(storage: KeyValueStore | null = webStorage()): Split {
  // Read once, lazily, so the first paint has the kept width rather than the
  // default and then a jump.
  const [width, setWidth] = useState(() => readEditorWidth(storage));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    writeEditorWidth(width, storage);
  }, [width, storage]);

  const dragTo = useCallback((x: number, available: number) => {
    setWidth(clampEditorWidth(x, available));
  }, []);

  const reset = useCallback(() => setWidth(DEFAULT_EDITOR_WIDTH), []);

  // Hiding keeps the width: showing the editor again puts it back where the user
  // had it, rather than at the default.
  const toggleEditor = useCallback(() => setVisible((was) => !was), []);

  return { editorWidth: visible ? width : 0, editorVisible: visible, toggleEditor, dragTo, reset };
}
