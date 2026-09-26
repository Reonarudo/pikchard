/**
 * The Command registry (#1023, #1053).
 *
 * One table behind every surface: the web dropdowns, the native menu bar, the
 * toolbar and the keyboard all read Commands from here, so a Command cannot be
 * enabled in one place and missing from another, and a toolbar button's spoken
 * name cannot drift from its menu item's (#1101 guard 7).
 *
 * `enabled` and `run` are **pure functions of the context**. Nothing here closes
 * over a component, a ref or a hook, which is what makes the whole table testable
 * with a fake context and no React at all — and what makes the native menu's
 * enabled state something that can be diffed rather than guessed.
 *
 * A Command **takes no arguments** (`CONTEXT.md`). Recent, the Examples and the
 * Scripts are lists built from data and are not Commands however they are drawn;
 * what *is* a Command is `nextScript`, `prevScript`, `toggleTheme`.
 */

import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { COPY } from "../copy.js";
import type { DocumentSession } from "../document/session.js";
import { canInsertFence, insertFence } from "../editor/commands.js";
import type { ExportCommands } from "../export/commands.js";
import type { PanZoom } from "../preview/panzoom.js";
import type { AppState } from "../store.js";
import type { Shortcut, ShortcutBinding } from "./shortcut.js";

export type CommandId =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "insertFence"
  | "exportSvg"
  | "exportPng"
  | "copyDiagram"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "fit"
  | "toggleEditor"
  | "toggleTheme"
  | "nextScript"
  | "prevScript"
  | "undo"
  | "redo"
  | "pikchrManual"
  | "about";

/**
 * Everything a Command may read or act on, assembled once at startup.
 *
 * The store is passed as a snapshot *getter* rather than as state: a Command runs
 * long after the menu that holds it was built, and it must act on what is true
 * then. `editor` is null before the editor mounts, which is the only reason any
 * Command has to check it.
 */
export interface CommandContext {
  readonly state: () => AppState;
  readonly session: DocumentSession;
  readonly exports: ExportCommands;
  readonly panzoom: PanZoom;
  readonly editor: () => EditorView | null;
  /** Put the cursor in Script `index`, zero-based — what the Script Commands do. */
  readonly jumpToScript: (index: number) => void;
  /** Show or hide the editor pane — the layout is the shell's, not the store's. */
  readonly toggleEditor: () => void;
  /** Open a URL outside the app: the Pikchr manual, and nothing else in v1. */
  readonly openExternal: (url: string) => void;
  /** Show the About panel. */
  readonly showAbout: () => void;
  /** Whether the editor pane is showing — only `toggleEditor`'s title needs it. */
  readonly editorVisible: boolean;
}

export interface Command {
  readonly id: CommandId;
  /**
   * Title Case, because a Command title is a label and not prose (#1100) — and a
   * function, because two of them change with the context.
   */
  readonly title: (ctx: CommandContext) => string;
  readonly shortcut?: ShortcutBinding;
  readonly enabled: (ctx: CommandContext) => boolean;
  /**
   * What a dimmed button says instead of its title, where the reason is worth
   * saying (#1055): the Export, Copy and zoom Commands, which all wait on the same
   * thing. Absent where there is nothing useful to add.
   */
  readonly disabledReason?: string;
  readonly run: (ctx: CommandContext) => void;
}

/** pikchr's own manual: the one route out of the app v1 offers (#1100). */
export const PIKCHR_MANUAL_URL = "https://pikchr.org/home/doc/trunk/doc/userman.md";

const always = () => true;

/** A Diagram exists to act on. What the Export, Copy and zoom Commands need. */
const hasDiagram = (ctx: CommandContext) => ctx.state().render.lastGood !== null;

/** More than one Script to move between. */
const hasSeveralScripts = (ctx: CommandContext) => ctx.state().scripts.count > 1;

/**
 * Move the cursor into the Script `step` away from the Active one, and stop at
 * the ends rather than wrapping: wrapping from the last Script to the first looks
 * like nothing happened in a Document long enough to need the Command.
 */
function stepScript(ctx: CommandContext, step: 1 | -1): void {
  const { scripts } = ctx.state();
  if (scripts.activeIndex === null) return;
  ctx.jumpToScript(Math.min(Math.max(scripts.activeIndex + step, 0), scripts.count - 1));
}

/** How deep the editor's history is, or zero before it has mounted. */
function depthOf(ctx: CommandContext, read: (state: EditorView["state"]) => number): number {
  const editor = ctx.editor();
  return editor ? read(editor.state) : 0;
}

export const COMMANDS: Record<CommandId, Command> = {
  new: {
    id: "new",
    title: () => "New",
    // The one Shortcut that differs: Chrome will not give up Mod+N, so the web
    // build asks for Alt as well rather than advertising a key it cannot claim.
    shortcut: { browser: { mod: true, alt: true, key: "n" }, desktop: { mod: true, key: "n" } },
    enabled: always,
    run: (ctx) => void ctx.session.newDocument(),
  },
  open: {
    id: "open",
    title: () => "Open…",
    shortcut: { mod: true, key: "o" },
    enabled: always,
    run: (ctx) => void ctx.session.open(),
  },
  save: {
    id: "save",
    // Always enabled: a Document with nowhere to go routes to Save As, and that
    // is the Platform's dialog speaking rather than a disabled Command (#1053).
    title: () => "Save",
    shortcut: { mod: true, key: "s" },
    enabled: always,
    run: (ctx) => void ctx.session.save(),
  },
  saveAs: {
    id: "saveAs",
    title: () => "Save As…",
    shortcut: { mod: true, shift: true, key: "s" },
    enabled: always,
    run: (ctx) => void ctx.session.saveAs(),
  },
  insertFence: {
    id: "insertFence",
    // "Insert Pikchr Diagram", never "Fence": Fence is internal vocabulary and
    // never reaches the screen (`CONTEXT.md`, #1100).
    title: () => "Insert Pikchr Diagram",
    enabled: (ctx) => {
      const editor = ctx.editor();
      return editor !== null && canInsertFence(editor.state);
    },
    run: (ctx) => {
      const editor = ctx.editor();
      if (!editor) return;
      insertFence(editor);
      editor.focus();
    },
  },
  exportSvg: {
    id: "exportSvg",
    disabledReason: COPY.nothingToExport,
    title: () => "Export SVG…",
    shortcut: { mod: true, key: "e" },
    enabled: hasDiagram,
    run: (ctx) => void ctx.exports.exportSvg(),
  },
  exportPng: {
    id: "exportPng",
    disabledReason: COPY.nothingToExport,
    title: () => "Export PNG…",
    shortcut: { mod: true, shift: true, key: "e" },
    enabled: hasDiagram,
    run: (ctx) => void ctx.exports.exportPng(),
  },
  copyDiagram: {
    id: "copyDiagram",
    disabledReason: COPY.nothingToCopy,
    title: () => "Copy Diagram",
    shortcut: { mod: true, shift: true, key: "c" },
    enabled: hasDiagram,
    run: (ctx) => void ctx.exports.copyDiagram(),
  },
  zoomIn: {
    id: "zoomIn",
    disabledReason: COPY.noDiagramYet,
    title: () => "Zoom In",
    shortcut: { mod: true, key: "=" },
    enabled: hasDiagram,
    run: (ctx) => ctx.panzoom.zoomIn(),
  },
  zoomOut: {
    id: "zoomOut",
    disabledReason: COPY.noDiagramYet,
    title: () => "Zoom Out",
    shortcut: { mod: true, key: "-" },
    enabled: hasDiagram,
    run: (ctx) => ctx.panzoom.zoomOut(),
  },
  zoomReset: {
    id: "zoomReset",
    disabledReason: COPY.noDiagramYet,
    title: () => "Actual Size",
    shortcut: { mod: true, key: "0" },
    enabled: hasDiagram,
    run: (ctx) => ctx.panzoom.actualSize(),
  },
  fit: {
    id: "fit",
    disabledReason: COPY.noDiagramYet,
    title: () => "Fit to View",
    shortcut: { mod: true, key: "1" },
    enabled: hasDiagram,
    run: (ctx) => ctx.panzoom.fit(),
  },
  toggleEditor: {
    id: "toggleEditor",
    // The title says what it will do, which is why it is a function of context.
    title: (ctx) => (ctx.editorVisible ? "Hide Editor" : "Show Editor"),
    shortcut: { mod: true, key: "b" },
    enabled: always,
    run: (ctx) => ctx.toggleEditor(),
  },
  toggleTheme: {
    id: "toggleTheme",
    title: (ctx) => (ctx.state().theme === "light" ? "Dark Theme" : "Light Theme"),
    shortcut: { mod: true, shift: true, key: "d" },
    enabled: always,
    run: (ctx) => ctx.state().toggleTheme(),
  },
  nextScript: {
    id: "nextScript",
    title: () => "Next Script",
    shortcut: { mod: true, alt: true, key: "arrowdown" },
    enabled: hasSeveralScripts,
    run: (ctx) => stepScript(ctx, 1),
  },
  prevScript: {
    id: "prevScript",
    title: () => "Previous Script",
    shortcut: { mod: true, alt: true, key: "arrowup" },
    enabled: hasSeveralScripts,
    run: (ctx) => stepScript(ctx, -1),
  },
  undo: {
    id: "undo",
    title: () => "Undo",
    // No Shortcut here: CodeMirror's own `historyKeymap` owns Mod+Z inside the
    // editor, and a second binding would run the history twice (#1053 guard 1).
    // Greyed when there is nothing to undo, which is what makes the native Edit
    // menu honest — and why Undo is a custom item on every OS (#1053 guard 2).
    enabled: (ctx) => depthOf(ctx, undoDepth) > 0,
    run: (ctx) => {
      const editor = ctx.editor();
      if (editor) undo(editor);
    },
  },
  redo: {
    id: "redo",
    title: () => "Redo",
    enabled: (ctx) => depthOf(ctx, redoDepth) > 0,
    run: (ctx) => {
      const editor = ctx.editor();
      if (editor) redo(editor);
    },
  },
  pikchrManual: {
    id: "pikchrManual",
    title: () => "Pikchr Language Manual",
    enabled: always,
    run: (ctx) => ctx.openExternal(PIKCHR_MANUAL_URL),
  },
  about: {
    id: "about",
    title: () => COPY.aboutTitle,
    enabled: always,
    run: (ctx) => ctx.showAbout(),
  },
};

/** Every Command that has a Shortcut, for the dispatchers to walk. */
export const SHORTCUT_COMMANDS: readonly Command[] = Object.values(COMMANDS).filter(
  (command): command is Command & { shortcut: ShortcutBinding } => command.shortcut !== undefined,
);

/** The Shortcut this Platform advertises for a Command, if it has one. */
export function shortcutOf(command: Command, kind: "browser" | "desktop"): Shortcut | undefined {
  if (!command.shortcut) return undefined;
  return "key" in command.shortcut ? command.shortcut : command.shortcut[kind];
}
