/**
 * Several selections at once, with Xcode's Shortcuts for making them.
 *
 * CodeMirror has the commands; what it does not have is the permission, which
 * is off by default, nor Xcode's keys. Its own keys for adding a cursor above
 * and below — Mod+Alt+↑/↓ — are Next Script and Previous Script here (#1053),
 * so Xcode's Ctrl+Shift+↑/↓ are not only familiar but free.
 *
 * - Option-drag selects a column, with a crosshair while Option is held.
 * - Ctrl+Shift-click adds a cursor; CodeMirror's own Mod-click still does too.
 * - Ctrl+Shift+↑/↓ adds a cursor on the line above or below.
 * - Option+Cmd+E selects the next occurrence of the selection, or of the word
 *   at the cursor.
 * - Escape goes back to one cursor: that is `defaultKeymap`'s already.
 */

import { addCursorAbove, addCursorBelow } from "@codemirror/commands";
import { selectNextOccurrence } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { crosshairCursor, EditorView, keymap, rectangularSelection } from "@codemirror/view";
import { isMac } from "../commands/shortcut.js";

export const multipleSelections: Extension = [
  EditorState.allowMultipleSelections.of(true),
  rectangularSelection(),
  crosshairCursor(),
  // CodeMirror reads only the first of these, and its own Mod-click applies
  // only when there are none — so Mod-click is restated here, not inherited.
  EditorView.clickAddsSelectionRange.of(
    (event) => (event.ctrlKey && event.shiftKey) || (isMac() ? event.metaKey : event.ctrlKey),
  ),
  keymap.of([
    { key: "Ctrl-Shift-ArrowUp", run: addCursorAbove, preventDefault: true },
    { key: "Ctrl-Shift-ArrowDown", run: addCursorBelow, preventDefault: true },
    { key: "Mod-Alt-e", run: selectNextOccurrence, preventDefault: true },
  ]),
];
