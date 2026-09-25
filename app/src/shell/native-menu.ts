/**
 * The desktop's own menu bar (#1023, #1053).
 *
 * Described from the same `MENUS` the web dropdowns render, so the two Platforms
 * cannot drift, and handed to the host through the Platform seam — which is why
 * this file imports nothing from `@tauri-apps` and can be tested against
 * `FakePlatform` (ADR 0001).
 *
 * Two rules from #1053 that this file exists to honour:
 *
 * - **Undo and Redo are custom items on every OS.** They come from `MENUS` as
 *   ordinary Commands; a predefined Undo would drive the *webview's* undo stack,
 *   which diverges from CodeMirror's, and could be neither greyed nor observed.
 * - **Enabled state is diff-and-pushed.** Every change is an IPC round trip and
 *   the state of twenty Commands is recomputed on every keystroke, so a keystroke
 *   that flips nothing pushes nothing (guard 7).
 */

import { useEffect, useRef } from "react";
import { diffMenuState, type MenuState, menuStateFor } from "../commands/menu-state.js";
import { MENUS } from "../commands/menus.js";
import { COMMANDS, type CommandContext, type CommandId, shortcutOf } from "../commands/registry.js";
import { acceleratorFor, isMac } from "../commands/shortcut.js";
import { COPY } from "../copy.js";
import type { Example } from "../examples/examples.js";
import type { DocumentRef, MenuNodeSpec, NativeMenu, Platform } from "../platform/types.js";
import { THEME_CHOICES, type ThemeChoice } from "../theme.js";

export interface NativeMenuOptions {
  readonly platform: Promise<Platform>;
  readonly ctx: CommandContext;
  readonly recent: readonly DocumentRef[];
  readonly examples: readonly Example[];
  readonly themeChoice: ThemeChoice;
  readonly onOpenRecent: (ref: DocumentRef) => void;
  readonly onOpenExample: (example: Example) => void;
  readonly onChooseTheme: (choice: ThemeChoice) => void;
  /** Quit's action: the same held-back close the window's own button gets. */
  readonly onQuit: () => void;
  /** Whether this host is a Mac, whose menu bar has an application submenu. */
  readonly mac?: boolean;
}

/** Every Command the menus hold, which is what the state diff walks. */
export const MENU_COMMAND_IDS: readonly CommandId[] = MENUS.flatMap((menu) =>
  menu.items.flatMap((item) => (item.kind === "command" ? [item.id] : [])),
);

/** The lists whose contents change while the app runs. */
interface Lists {
  readonly recent: readonly DocumentRef[];
  readonly examples: readonly Example[];
  readonly themeChoice: ThemeChoice;
}

/**
 * Describe the whole menu bar.
 *
 * Exported for its own test: what the menu *says* is decided here, and the only
 * part that needs a desktop is the handing over.
 */
export function describeMenu(
  ctx: CommandContext,
  lists: Lists,
  handlers: Pick<NativeMenuOptions, "onOpenRecent" | "onOpenExample" | "onChooseTheme" | "onQuit">,
  mac: boolean,
): readonly MenuNodeSpec[] {
  const item = (id: CommandId): MenuNodeSpec => {
    const command = COMMANDS[id];
    const shortcut = shortcutOf(command, "desktop");
    return {
      kind: "item",
      id,
      text: command.title(ctx),
      enabled: command.enabled(ctx),
      ...(shortcut ? { accelerator: acceleratorFor(shortcut) } : {}),
      // Read from the table at call time, not captured: the Command's own
      // `enabled` decides, so a stale menu cannot run a disabled Command.
      action: () => {
        if (COMMANDS[id].enabled(ctx)) COMMANDS[id].run(ctx);
      },
    };
  };

  const submenus: MenuNodeSpec[] = [];

  // macOS keeps About and Quit in the application submenu, and Quit has to be
  // ours: the predefined one takes the process without `ExitRequested` ever
  // firing, so the Draft would be all that survived (#1020).
  if (mac) {
    submenus.push({
      kind: "submenu",
      text: COPY.appName,
      items: [
        item("about"),
        { kind: "separator" },
        { kind: "predefined", item: "hide" },
        { kind: "predefined", item: "hideOthers" },
        { kind: "predefined", item: "showAll" },
        { kind: "separator" },
        {
          kind: "item",
          id: "quit",
          text: COPY.quit,
          accelerator: "CmdOrCtrl+Q",
          action: handlers.onQuit,
        },
      ],
    });
  }

  for (const menu of MENUS) {
    const items: MenuNodeSpec[] = [];
    for (const entry of menu.items) {
      switch (entry.kind) {
        case "command":
          items.push(item(entry.id));
          break;
        case "separator":
          items.push({ kind: "separator" });
          break;
        case "predefined":
          items.push({ kind: "predefined", item: entry.item });
          break;
        case "list":
          items.push(...listItems(entry.list, lists, handlers));
          break;
      }
    }
    submenus.push({ kind: "submenu", text: menu.title, items });
  }

  return submenus;
}

function listItems(
  list: "recent" | "examples" | "themes",
  lists: Lists,
  handlers: Pick<NativeMenuOptions, "onOpenRecent" | "onOpenExample" | "onChooseTheme">,
): MenuNodeSpec[] {
  if (list === "recent") {
    return lists.recent.map((entry) => ({
      kind: "item",
      id: `recent:${entry.key}`,
      text: entry.name,
      action: () => handlers.onOpenRecent(entry),
    }));
  }
  if (list === "examples") {
    return lists.examples.map((example) => ({
      kind: "item",
      id: `example:${example.name}`,
      text: example.name,
      action: () => handlers.onOpenExample(example),
    }));
  }
  return THEME_CHOICES.map(({ choice, label }) => ({
    kind: "item",
    id: `theme:${choice}`,
    text: label,
    // A check item, because the three are one choice with three answers (#1053).
    checked: choice === lists.themeChoice,
    action: () => handlers.onChooseTheme(choice),
  }));
}

/**
 * Hand the host a menu, then keep its enabled states and titles current.
 *
 * Rebuilt only when the data-driven lists change — Recent, the Examples, the theme
 * choice — because rebuilding is an order of magnitude more IPC than pushing two
 * flags, and most of what changes is flags.
 */
export function useNativeMenu(options: NativeMenuOptions): void {
  const { platform, ctx, recent, examples, themeChoice, mac } = options;

  // Read through a ref so a rebuild never depends on a callback's identity.
  const latest = useRef(options);
  latest.current = options;

  const menu = useRef<NativeMenu | null>(null);
  const pushed = useRef<MenuState | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const host = await platform;
      const { ctx: current, onOpenRecent, onOpenExample, onChooseTheme, onQuit } = latest.current;
      const built = await host.setApplicationMenu(
        describeMenu(
          current,
          { recent, examples, themeChoice },
          { onOpenRecent, onOpenExample, onChooseTheme, onQuit },
          mac ?? isMac(),
        ),
      );
      if (!live) return;
      menu.current = built;
      // A freshly built menu already says the right thing, so the next diff must
      // compare against that rather than against nothing.
      pushed.current = built ? menuStateFor(MENU_COMMAND_IDS, latest.current.ctx) : null;
    })();
    return () => {
      live = false;
    };
  }, [platform, recent, examples, themeChoice, mac]);

  // On every render — which is to say on every keystroke — and free when nothing
  // moved.
  useEffect(() => {
    const built = menu.current;
    if (!built) return;
    const next = menuStateFor(MENU_COMMAND_IDS, ctx);
    for (const change of diffMenuState(pushed.current, next)) {
      if (change.enabled !== undefined) built.setEnabled(change.id, change.enabled);
      if (change.title !== undefined) built.setText(change.id, change.title);
    }
    pushed.current = next;
  });
}
