# Manual checks for the web build

Playwright covers the web build well, but five things it cannot settle are left
here for a human with a real browser. Run the first three after changing the
editor's extensions, the menus, or anything about focus, and the last two after
changing the service worker, the Toasts or the Draft.

## Checks

1. **Tab leaves the editor, in a real Firefox.** Click into the editor and press
   Tab. Focus must move to the chrome. If it does not, press Escape and then Tab —
   CodeMirror's own documented fallback — which must.

   Under Playwright neither works in Firefox, which is why the keyboard e2e skips
   this assertion there (#1101 guard 5). **Checked in a real Firefox on
   2026-09-25: Tab leaves the editor.** So the skip covers a Playwright quirk, not
   a keyboard trap. Re-check it after any change to the editor's keymaps.

2. **Tab reaches every toolbar button in Safari.** With macOS *Full Keyboard
   Access* on (System Settings ▸ Keyboard), Tab walks the whole chrome. The e2e
   asserts this on Chromium only, because the setting is the system's and not the
   page's.

3. **Copy Diagram puts a real image on the real clipboard.** Copy, then paste into
   an app that takes images. The e2e asserts the Toast and the payload against the
   `FakePlatform`; only a human can see the bitmap arrive.

4. **A new version waits for the user, and keeps their work.** Build and run
   `vite preview`, open the app, and type something without saving. Change any
   source file, rebuild, and reload the preview's `sw.js` in devtools (or wait for
   the browser's own update check). The Toast *"A new version of Pikchard is
   ready"* appears and stays there. Click **Reload**: the page reloads with no
   "Leave site?" dialog and no Restore list, and the unsaved text is back. Unit
   tests cover each step. Only a real browser shows the worker actually swapping.

5. **The Home Screen hint, on a real iPhone or iPad.** In Safari (not from the
   Home Screen), type in the editor and wait a second. *"Add Pikchard to your
   Home Screen to keep unsaved work for longer"* appears once, and never again on
   later edits or visits. It must not appear on arrival, in any other iOS browser,
   or once the app is on the Home Screen.
