/**
 * Where the Commands appear (#1023, #1047, #1053).
 *
 * One ordered description of the menus, rendered twice: the Tauri builder makes a
 * native menu bar out of it and the web build draws dropdowns from the very same
 * lists. A Command that is added to `MENUS` therefore appears on both Platforms,
 * and one that is added to neither `MENUS` nor `TOOLBAR` fails the test that says
 * every Command has a surface — because a Shortcut is never a Command's only way
 * in (#1053 guard 3: a browser user can re-reserve keys per site).
 *
 * The **Edit menu is desktop-only**. Its Cut/Copy/Paste/Select All are the OS's
 * own predefined items, which the web build gets from the browser for free, and
 * inventing a web Edit menu to hold Undo and Redo — which CodeMirror already
 * binds — would be a menu built for symmetry rather than for use.
 */

import { COPY } from "../copy.js";
import type { PredefinedMenuItemKind } from "../platform/types.js";
import type { CommandId } from "./registry.js";

/**
 * An item in a menu: a Command, a separator, a list built from data, or one of
 * the OS's own predefined items.
 *
 * The data-driven ones are named rather than listed because their contents change
 * while the app runs — and because they are *not* Commands (`CONTEXT.md`): a
 * Recent entry takes an argument, and a Command never does.
 */
export type MenuItem =
  | { readonly kind: "command"; readonly id: CommandId }
  | { readonly kind: "separator" }
  | { readonly kind: "list"; readonly list: "recent" | "examples" | "themes" }
  | { readonly kind: "predefined"; readonly item: PredefinedItem };

/**
 * The items only an OS can supply — the Edit menu's four, which is a subset of
 * what the Platform seam can build. Narrowed from that union rather than written
 * out again, so the two cannot drift and no bridge between them is needed.
 */
export type PredefinedItem = Extract<
  PredefinedMenuItemKind,
  "cut" | "copy" | "paste" | "selectAll"
>;

export interface Menu {
  /**
   * The menu's own name, from `copy.ts` — a menu is not a Command, so its name is
   * an ordinary user-facing string and lives where they all do (#1100).
   */
  readonly title: string;
  /** Desktop-only menus: the Edit menu, whose items are the OS's. */
  readonly desktopOnly?: boolean;
  readonly items: readonly MenuItem[];
}

const command = (id: CommandId): MenuItem => ({ kind: "command", id });
const separator: MenuItem = { kind: "separator" };

export const MENUS: readonly Menu[] = [
  {
    title: COPY.fileMenu,
    items: [
      command("new"),
      // Directly under New, because inserting a Fence is an action on the file's
      // contents and that is what File already means here (#1100).
      command("insertFence"),
      command("open"),
      separator,
      command("save"),
      command("saveAs"),
      separator,
      command("exportSvg"),
      command("exportPng"),
      command("copyDiagram"),
      separator,
      { kind: "list", list: "recent" },
    ],
  },
  {
    title: COPY.editMenu,
    // Undo and Redo are custom items on *every* OS: a predefined Undo drives a
    // diverging native undo stack, cannot be greyed and emits no event (#1053 g2).
    desktopOnly: true,
    items: [
      command("undo"),
      command("redo"),
      separator,
      { kind: "predefined", item: "cut" },
      { kind: "predefined", item: "copy" },
      { kind: "predefined", item: "paste" },
      { kind: "predefined", item: "selectAll" },
    ],
  },
  {
    title: COPY.viewMenu,
    items: [
      command("zoomIn"),
      command("zoomOut"),
      command("zoomReset"),
      command("fit"),
      separator,
      command("toggleEditor"),
      command("toggleTheme"),
      // The three theme choices are one choice with three answers, and so a list
      // built from data rather than three Commands (#1053).
      { kind: "list", list: "themes" },
      separator,
      command("nextScript"),
      command("prevScript"),
    ],
  },
  {
    title: COPY.examplesMenu,
    items: [{ kind: "list", list: "examples" }],
  },
  {
    title: COPY.helpMenu,
    items: [command("pikchrManual"), separator, command("about")],
  },
];

/**
 * The toolbar's icon groups, in #1047's order: the hairlines between them are the
 * group boundaries, so this is a list of lists.
 */
export const TOOLBAR: ReadonlyArray<readonly CommandId[]> = [
  ["new", "open", "save"],
  ["exportSvg", "copyDiagram"],
  ["zoomOut", "zoomReset", "zoomIn", "fit"],
  ["toggleTheme", "toggleEditor"],
];

/** Every Command that `MENUS` or `TOOLBAR` puts on screen somewhere. */
export function surfacedCommands(): ReadonlySet<CommandId> {
  const ids = new Set<CommandId>();
  for (const menu of MENUS) {
    for (const item of menu.items) if (item.kind === "command") ids.add(item.id);
  }
  for (const group of TOOLBAR) for (const id of group) ids.add(id);
  return ids;
}
