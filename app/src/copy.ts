/**
 * Everything Pikchard says, in one place (#1100).
 *
 * Command titles live in the Command registry, where a title is already a
 * property of the Command; every other user-facing string lives here, and
 * nowhere else. The point is reviewability rather than translation — there is
 * no i18n — and the value of it is that the whole vocabulary can be read in
 * one sitting a year from now.
 *
 * The rules the strings below obey: only *Script*, *Example*, *Diagram*,
 * *Recent* and *Untitled* of the glossary's terms ever reach the screen;
 * second person only where the user must decide, and an impersonal statement
 * of what happened otherwise; sentence case; **Pikchard** is the app and
 * **Pikchr** is the language, never abbreviated.
 */

import { REPOSITORY_URL } from "./version.js";

export const COPY = Object.freeze({
  /**
   * The one empty Preview that says anything at all. The other two — the
   * renderer still loading, and a Script that has never rendered — say
   * nothing, because one resolves in milliseconds and the other already has
   * the banner to explain itself.
   *
   * This one is a dead end: nothing the user types produces a Diagram unless
   * they already know the fence syntax, and the link beneath is the only
   * always-available route to the Command that writes one.
   */
  noDiagrams: "No Pikchr diagrams in this file.",
  insertDiagram: "Insert one",

  /** The Diagram, to a screen reader, which is told it is there and no more. */
  diagramLabel: "Diagram",

  /**
   * Save, as **Prompt A's affirmative button** — not as the Command, whose title
   * is the registry's (#1053). The same word for the same act, and the Prompt is
   * the reason the string is still here now that the registry exists.
   */
  save: "Save",

  /**
   * The app, in its own macOS menu and in the web manifest, which is what an
   * install prompt and the Home Screen show (#1025).
   */
  appName: "Pikchard",
  appDescription: "A live editor for Pikchr diagrams",
  quit: "Quit Pikchard",

  /**
   * The menu bar's own names (#1023, #1047). The *items* inside them are
   * Commands, and a Command's title belongs to the registry by the rule above —
   * but a menu is not a Command, so its name lives here like every other string.
   */
  fileMenu: "File",
  editMenu: "Edit",
  viewMenu: "View",
  examplesMenu: "Examples",
  helpMenu: "Help",

  /**
   * The theme choices (#1022, #1047).
   *
   * "Follow system" rather than "System" or "Auto": it says what will happen, and
   * it is the phrase the platforms themselves use. Not Commands either — the three
   * are one choice with three answers, which is a list built from data (#1053).
   */
  theme: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "Follow system",

  /**
   * The Document's Name in the top bar, and the dot beside it (#1047).
   *
   * The dot is a pure function of Unsaved and says nothing about the Draft:
   * there is no "saving…" and no "all changes saved" anywhere in Pikchard
   * (#1054). `unsavedLabel` is what the dot is to anything that cannot see it —
   * a string #1100 did not write, because #1100 wrote what is read and this is
   * read only aloud. It borrows Prompt C's phrase rather than inventing one:
   * *Unsaved* is a glossary term and not the app's own word, and "unsaved work"
   * is what #1100 calls the same thing on screen.
   */
  unsavedLabel: "Unsaved work",

  /**
   * **Prompt A** — replacing or closing unsaved work. Fires on Open, a drop, an
   * Example, New and close.
   *
   * The body line is not garnish. #1054 made "Don't save" *keep* the work, but
   * a user reads that button with the meaning it has in every other app — the
   * work is gone — and would never discover otherwise. The sentence makes a
   * hidden feature visible, and stays honest about the limit: the changes are
   * kept in Pikchard, not in the file, which is the only guarantee the storage
   * can make.
   */
  saveChangesTo: (name: string) => `Save changes to ${name}?`,
  saveChangesUntitled: "Save your changes?",
  saveChangesBody: "Not saving keeps your changes in Pikchard, but not in the file.",
  // The affirmative button is `save` above: the same word, and the same act.
  dontSave: "Don't save",
  cancel: "Cancel",

  /**
   * **Prompt B** — the file changed underneath, asked at Save.
   *
   * `Cancel` is the default button, the one both Return and Escape reach. This
   * is the only destructive Prompt in the app, and what it destroys is someone
   * else's work, which Pikchard cannot see and cannot get back.
   */
  overwrite: (name: string) => `Overwrite ${name}?`,
  overwriteBody:
    "The file has changed since you opened it. Saving replaces those changes with yours.",
  overwriteConfirm: "Overwrite",

  /**
   * **Prompt C** — Restore, on a cold launch with nothing else to open.
   *
   * "Draft" never appears: it is internal vocabulary, and what the user has is
   * unsaved work. Times are relative — "2 hours ago" — and never timestamps.
   */
  unsavedWorkTitle: "Unsaved work from last time",
  restore: "Restore",
  discard: "Discard",
  discardAll: "Discard all",
  /** A row: the Document's Name, and when its work was last seen. */
  unsavedWorkRow: (name: string, when: string) => `${name} · ${when}`,

  /**
   * How long ago, in words. `Intl.RelativeTimeFormat` rather than a hand-rolled
   * ladder, so "yesterday" and "last week" read as English rather than as
   * arithmetic.
   */
  timeAgo: (at: number, now: number = Date.now()) => formatTimeAgo(at, now),

  /** Recent, in the File menu. Absent entirely where the Platform keeps none. */
  recent: "Recent",

  /**
   * About (#1100). Four lines and no more: no credits, no acknowledgements, and
   * no "Check for updates" — the service worker owns updates (#1025).
   *
   * The pinned pikchr version is here because it is the one fact a bug report
   * needs and the one a user cannot otherwise obtain.
   */
  aboutTitle: "About Pikchard",
  aboutVersion: (version: string) => `Pikchard ${version}`,
  aboutPikchr: (version: string) => `Pikchr ${version}`,
  /** The repository, shown without its scheme — the URL itself is `version.ts`'s. */
  aboutRepository: REPOSITORY_URL.replace(/^https?:\/\//, ""),
  aboutLicence: "MIT · pikchr is 0BSD",
  close: "Close",

  /** The cursor, in the status bar. */
  cursorAt: (line: number, col: number) => `Ln ${line}, Col ${col}`,

  /**
   * The Recent Toasts (#1100).
   *
   * The second says that the entry was removed, because the user is about to
   * watch the menu change under them and this is the only explanation they get.
   * The first deliberately does not, since nothing changed — and its wording
   * points at the fix, clicking again and allowing, without instructing anyone.
   */
  cannotOpenWithoutPermission: (name: string) => `Can't open ${name} without permission`,
  movedOrDeleted: (name: string) => `${name} has moved or been deleted — removed from Recent`,

  /**
   * The Save Toasts.
   *
   * A download is the only *successful* write that earns one (#1055 Q11): on
   * Firefox and Safari it is the ordinary outcome of Save, and without this the
   * Save would appear to do nothing at all. A failure earns one because #1055
   * Q15 settled that failures are Toasts and not Prompts.
   */
  savedToDownloads: "Saved to your downloads",
  cannotSave: (name: string) => `Can't save ${name}`,

  /**
   * Export and Copy (#1055, ratified unchanged by #1100).
   *
   * A successful Export through a dialog says **nothing**: the dialog was the
   * confirmation. A Copy says something because nothing else on screen changes.
   * "diagram" is lowercase in all of them — it is a product word only where it is
   * a label, as in the `Copy Diagram` button.
   *
   * The two stale lines *replace* the success wording rather than joining it,
   * because they carry the one fact the user cannot see: the file or the
   * clipboard holds the last Diagram that rendered, not the text on screen.
   */
  diagramCopied: "Diagram copied",

  /**
   * Why a Command is dimmed, where the reason is not obvious (#1055). It replaces
   * the button's title while the Command cannot run — dimmed and never hidden, so
   * a keyboard user who lands on it is told why rather than finding it gone.
   */
  nothingToExport: "Nothing to export yet",
  nothingToCopy: "Nothing to copy yet",
  noDiagramYet: "No diagram yet",
  exportedStale: "Exported the last diagram that rendered",
  copiedStale: "Copied the last diagram that rendered",
  cannotCopyDiagram: "Couldn't copy the diagram",
  cannotSaveFile: "Couldn't save the file",

  /**
   * The update Toast (#1025, #1100). It never goes on its own, because it asks
   * for a decision rather than reporting one; `Reload` is the decision. There
   * is deliberately no offline-ready notice.
   */
  updateReady: "A new version of Pikchard is ready",
  reload: "Reload",

  /**
   * The iOS Home Screen hint (#1025, #1100), shown once, the first time unsaved
   * work is kept. Over the ceiling on purpose: it must name both the gesture
   * and the reason, and neither half works alone.
   */
  homeScreenHint: "Add Pikchard to your Home Screen to keep unsaved work for longer",

  /**
   * The Open Toasts (#1100, #1018).
   *
   * The first spends no words on the file that *did* open, because the title bar
   * names it one line above; what nothing else explains is the files that did
   * not, so the count is always `1 of N` and never a bare "some were skipped".
   * It is not a Prompt: a user who multi-selected by accident should not have to
   * answer for it.
   *
   * The second names the categories rather than the extensions — someone who
   * dropped a `.pdf` needs to know what *does* work — and says "files" because
   * "Document" is internal vocabulary that never reaches the screen.
   */
  openedOneOfSeveral: (count: number) =>
    `Opened 1 of ${count} files — Pikchard opens one at a time`,
  cannotOpenFile: (name: string) => `Can't open ${name} — Pikchard opens Pikchr and Markdown files`,

  /**
   * The Script selector, in the status bar (#1019, #1047).
   *
   * Counting from one, which is the only place in Pikchard that does: every
   * Script index in the code is zero-based, and the user has never heard of
   * index zero. *Script* is one of the five glossary terms the app does say.
   *
   * "1 Script" rather than "Script 1 of 1": with nowhere to jump to, the cell
   * is a statement and not a choice, and it reads as one.
   */
  scriptOf: (index: number, count: number) => `Script ${index} of ${count}`,
  script: (index: number) => `Script ${index}`,
  oneScript: "1 Script",

  /**
   * How a Render reads in the status bar. There is no third form: the Render
   * is synchronous, so "Rendering…" is a state that cannot occur (#1086).
   */
  renderedIn: (ms: number) => `Rendered in ${ms.toFixed(1)} ms`,
  errorAt: (position: string) => `Error at ${position}`,

  /**
   * The zoom, as the status bar reports it. The *buttons* are Commands and take
   * their labels from the registry; this is the mode, not a control.
   */
  fitting: "fit",
});

/** The units "how long ago" is expressed in, largest first. */
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "2 hours ago", "yesterday", "just now".
 *
 * The largest unit that fits, which is how a person would say it: unsaved work
 * from three days ago is "3 days ago" and not seventy-something hours. Anything
 * under a minute is "just now" — `Intl` would say "in 0 seconds", and a Draft
 * written seconds ago is one the user has only just stopped typing.
 */
function formatTimeAgo(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, span] of UNITS) {
    const count = Math.floor(elapsed / span);
    if (count >= 1) return relative.format(-count, unit);
  }
  return "just now";
}
