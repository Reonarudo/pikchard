# Manual checks for the desktop Platform seam

`TauriPlatform` (#1041) talks to dialogs, the OS clipboard, drag-and-drop and
the single-instance plugin. `cargo test` covers the Rust commands' logic and
Vitest covers `BrowserPlatform` and `FakePlatform`, but nothing automated can
reach the host surfaces below — WebDriver was considered and declined for v1
(#1096), because it cannot reach the OS.

Run these after changing anything in `app/src/platform/tauri.ts`,
`app/src-tauri/src/open.rs`, or `capabilities/default.json`. Start with
`npm run tauri dev`.

**This is not the release gate.** The per-release desktop smoke checklist is a
separate, deliberately capped file (`docs/desktop-release-checklist.md`, #1096)
run by a human against built artifacts at the draft → publish boundary. This
file is for the developer who just changed the seam, and it may be run against
a dev build. Keep items here out of that file and vice versa.

## Checks

1. **Open a Document.** File → Open, pick a `.md` and a `.pikchr`. The text
   loads and the Name shows. Cancelling the dialog changes nothing.
2. **Save in place.** Edit, Save. The file on disk changes and no dialog
   appears. Then Save As to a new path: the dialog's default name is the
   current Name.
3. **Recent survives a relaunch.** Open two Documents, quit, relaunch. Both are
   in Recent, most recent first. Opening one of them *reads it* — this is what
   proves `open_path` re-allows the path, since runtime fs scope is empty on a
   fresh launch (#1057). A Recent entry whose file you deleted must disappear
   when clicked, not error.
4. **Drag and drop.** Drag a `.pikchr` onto the window. It opens. This must go
   through `onDragDropEvent` — with `dragDropEnabled` the DOM `drop` event never
   fires for OS files, so if it works via HTML5 events something is misconfigured.
5. **Open with, app not running.** Double-click a `.pikchr` in the file manager.
   The app launches and opens it — the `take_open_paths` path.
6. **Open with, app already running.** Double-click a second file. The existing
   window is raised *and* the file opens — the `pikchard://open-requested` event
   path, plus single-instance. Two Pikchards must never appear, macOS included.
7. **Reload does not re-open.** With a file open, reload the webview. The launch
   file must not come back over your work — `take_open_paths` drains.
8. **Clipboard.** Copy the Diagram, then paste into an app that takes images.
   The image arrives. `Image.fromBytes` needs `tauri`'s `image-png` feature; a
   failure here usually means that feature was dropped.
9. **Export.** Export SVG and PNG to a chosen path. The file is written, and
   the Document's own Name and Recent entry are unchanged — an Export is never
   a Save (#1055).
10. **A file Pikchard does not open.** Drag a `.pdf` or a `.png` onto the window.
    A toast says so, naming the file, and the Document on screen is untouched —
    no Prompt, and nothing loaded as text (#1018).
11. **Several files at once.** Multi-select two `.pikchr` files and open them
    together (or pass both on argv). The first in the delivered order opens and
    a toast says "Opened 1 of 2 files"; the rest are dropped silently.
12. **Unsaved work is asked about first.** With unsaved changes, drop a file on
    the window. The Prompt appears *before* anything is replaced, and Cancel
    leaves the Document exactly as it was — including the case where the file
    came from a second "open with" whose process has already exited (#1057).
13. **The native menu bar.** File / Edit / View / Examples / Help are there, with
    accelerators, and the in-app text menus are *absent*. Export SVG is greyed
    until something renders; Edit ▸ Undo is greyed until you type, and undoes
    exactly one CodeMirror change afterwards — neither zero nor two (#1053 g6).
    On macOS the application submenu carries About Pikchard and a Quit of ours:
    Cmd+Q with unsaved work must ask before the process goes.
14. **Associations, on an installed package.** Not reachable from `tauri dev`:
    install the deb or the rpm and check that a `.pikchr` file's default
    application is Pikchard, and that a `.md` file's is *not* — Pikchard appears
    only under "Open With". The AppImage associates nothing, by design.
