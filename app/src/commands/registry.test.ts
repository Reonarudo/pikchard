/**
 * The Command registry, against a fake context and no React at all (#1053).
 *
 * That this file needs no editor, no store and no DOM *is* the design: `enabled`
 * and `run` are pure functions of the context, which is what makes the native
 * menu's state diffable and this test cheap enough to cover the whole table.
 */

import { history, redo, undo } from "@codemirror/commands";
import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { languageExtension, languageForName } from "../editor/language.js";
import { MENUS, surfacedCommands, TOOLBAR } from "./menus.js";
import { COMMANDS, type CommandContext, type CommandId, PIKCHR_MANUAL_URL } from "./registry.js";
import { matchesShortcut, shortcutFor } from "./shortcut.js";

/** What each Command did, in the order it was asked. */
interface Ran {
  readonly calls: string[];
  readonly opened: string[];
  readonly jumps: number[];
}

function fakeContext(
  over: {
    lastGood?: boolean;
    scriptCount?: number;
    activeIndex?: number | null;
    theme?: "light" | "dark";
    editorVisible?: boolean;
    editor?: EditorView | null;
  } = {},
): { ctx: CommandContext; ran: Ran } {
  const ran: Ran = { calls: [], opened: [], jumps: [] };
  const note = (what: string) => () => {
    ran.calls.push(what);
  };

  const state = () =>
    ({
      render: { lastGood: over.lastGood === false ? null : { diagram: {}, script: "" } },
      scripts: { count: over.scriptCount ?? 1, activeIndex: over.activeIndex ?? 0 },
      theme: over.theme ?? "light",
      toggleTheme: note("toggleTheme"),
    }) as unknown as ReturnType<CommandContext["state"]>;

  const ctx: CommandContext = {
    state,
    session: {
      newDocument: async () => note("new")(),
      open: async () => note("open")(),
      save: async () => {
        note("save")();
        return null;
      },
      saveAs: async () => {
        note("saveAs")();
        return null;
      },
    } as unknown as CommandContext["session"],
    exports: {
      canExport: over.lastGood !== false,
      exportSvg: async () => note("exportSvg")(),
      exportPng: async () => note("exportPng")(),
      copyDiagram: async () => note("copyDiagram")(),
    },
    panzoom: {
      zoomIn: note("zoomIn"),
      zoomOut: note("zoomOut"),
      actualSize: note("actualSize"),
      fit: note("fit"),
    } as unknown as CommandContext["panzoom"],
    editor: () => over.editor ?? null,
    jumpToScript: (index) => ran.jumps.push(index),
    toggleEditor: note("toggleEditor"),
    openExternal: (url) => ran.opened.push(url),
    showAbout: note("about"),
    editorVisible: over.editorVisible ?? true,
  };
  return { ctx, ran };
}

/**
 * An editor as the Commands see one: a state and a `dispatch`.
 *
 * Deliberately not a mounted `EditorView` — a real view measures itself against a
 * layout jsdom does not have, and every Command here reads `state` and dispatches.
 * The mounted editor is #1085's own test.
 */
function editorOn(text: string, name = "notes.md"): EditorView {
  const view = {
    state: EditorState.create({
      doc: text,
      extensions: [history(), languageExtension(languageForName(name))],
    }),
    /** Both shapes CodeMirror allows: a transaction, or specs to make one of. */
    dispatch(...specs: unknown[]) {
      const first = specs[0] as Transaction | undefined;
      const transaction =
        first && "state" in first ? first : view.state.update(...(specs as TransactionSpec[]));
      view.state = transaction.state;
    },
    focus() {},
  };
  return view as unknown as EditorView;
}

describe("every Command", () => {
  it("has a surface that is not a Shortcut", () => {
    // A Shortcut is never a Command's only way in: a browser user can re-reserve
    // keys per site, and then the Command would be unreachable (#1053 guard 3).
    const surfaced = surfacedCommands();
    const missing = (Object.keys(COMMANDS) as CommandId[]).filter((id) => !surfaced.has(id));

    expect(missing).toEqual([]);
  });

  it("has a title in Title Case, and an ellipsis where a dialog follows", () => {
    const { ctx } = fakeContext();

    expect(COMMANDS.open.title(ctx)).toBe("Open…");
    expect(COMMANDS.saveAs.title(ctx)).toBe("Save As…");
    expect(COMMANDS.exportSvg.title(ctx)).toBe("Export SVG…");
    // Save opens no dialog of Pikchard's own, so it has no ellipsis.
    expect(COMMANDS.save.title(ctx)).toBe("Save");
    expect(COMMANDS.copyDiagram.title(ctx)).toBe("Copy Diagram");
  });

  it("never says Fence, which is a word the app does not use", () => {
    const { ctx } = fakeContext();

    expect(COMMANDS.insertFence.title(ctx)).toBe("Insert Pikchr Diagram");
  });
});

describe("no two Shortcuts collide", () => {
  it("across the whole table, on either Platform", () => {
    for (const kind of ["browser", "desktop"] as const) {
      const seen = new Map<string, CommandId>();
      for (const command of Object.values(COMMANDS)) {
        if (!command.shortcut) continue;
        const shortcut = shortcutFor(command.shortcut, kind);
        const key = JSON.stringify({
          mod: shortcut.mod ?? false,
          shift: shortcut.shift ?? false,
          alt: shortcut.alt ?? false,
          key: shortcut.key,
        });
        expect(seen.get(key), `${kind}: ${key} is claimed twice`).toBeUndefined();
        seen.set(key, command.id);
      }
    }
  });

  it("and none of them is a key CodeMirror's own keymaps already own", () => {
    // The keymaps the editor enables are `standardKeymap`, `defaultKeymap` and
    // `historyKeymap` (#1053). A Command that claimed one of their bindings would
    // work everywhere except in the editor, which is where the user is.
    const CODEMIRROR_OWNED: Array<{ mod: boolean; shift?: boolean; alt?: boolean; key: string }> = [
      { mod: true, key: "z" }, // undo
      { mod: true, shift: true, key: "z" }, // redo
      { mod: true, key: "y" }, // redo, Windows/Linux
      { mod: true, key: "a" }, // select all
      { mod: true, key: "c" }, // copy
      { mod: true, key: "v" }, // paste
      { mod: true, key: "x" }, // cut
      { mod: true, key: "arrowup" }, // document start
      { mod: true, key: "arrowdown" }, // document end
    ];

    for (const owned of CODEMIRROR_OWNED) {
      const event = new KeyboardEvent("keydown", {
        key: owned.key,
        metaKey: owned.mod,
        shiftKey: owned.shift ?? false,
        altKey: owned.alt ?? false,
      });
      for (const command of Object.values(COMMANDS)) {
        if (!command.shortcut) continue;
        for (const kind of ["browser", "desktop"] as const) {
          const clash = matchesShortcut(event, shortcutFor(command.shortcut, kind));
          expect(clash, `${command.id} claims ${owned.key} from CodeMirror`).toBe(false);
        }
      }
    }
  });

  it("gives the web build its own New, because the browser owns Mod+N", () => {
    const shortcut = COMMANDS.new.shortcut;
    if (!shortcut) throw new Error("New has a Shortcut");

    expect(shortcutFor(shortcut, "browser")).toEqual({ mod: true, alt: true, key: "n" });
    expect(shortcutFor(shortcut, "desktop")).toEqual({ mod: true, key: "n" });
  });
});

describe("what is enabled", () => {
  it("lets the Document Commands run at any time", () => {
    const { ctx } = fakeContext({ lastGood: false });

    for (const id of ["new", "open", "save", "saveAs", "toggleEditor", "toggleTheme"] as const) {
      expect(COMMANDS[id].enabled(ctx), id).toBe(true);
    }
  });

  it("holds Export, Copy and the zoom four back until a Diagram exists", () => {
    const without = fakeContext({ lastGood: false }).ctx;
    const with_ = fakeContext({ lastGood: true }).ctx;

    for (const id of [
      "exportSvg",
      "exportPng",
      "copyDiagram",
      "zoomIn",
      "zoomOut",
      "zoomReset",
      "fit",
    ] as const) {
      expect(COMMANDS[id].enabled(without), id).toBe(false);
      expect(COMMANDS[id].enabled(with_), id).toBe(true);
    }
  });

  it("offers the Script Commands only where there is somewhere to go", () => {
    expect(COMMANDS.nextScript.enabled(fakeContext({ scriptCount: 1 }).ctx)).toBe(false);
    expect(COMMANDS.nextScript.enabled(fakeContext({ scriptCount: 3 }).ctx)).toBe(true);
  });

  it("offers Insert Pikchr Diagram only in a Markdown Document", () => {
    const markdownEditor = editorOn("# notes\n", "notes.md");
    const pikchrEditor = editorOn("box\n", "flow.pikchr");

    expect(COMMANDS.insertFence.enabled(fakeContext({ editor: markdownEditor }).ctx)).toBe(true);
    expect(COMMANDS.insertFence.enabled(fakeContext({ editor: pikchrEditor }).ctx)).toBe(false);
    // And not at all before the editor exists.
    expect(COMMANDS.insertFence.enabled(fakeContext({ editor: null }).ctx)).toBe(false);
  });

  it("greys Undo and Redo by the editor's own history depth", () => {
    const editor = editorOn("box\n");
    const { ctx } = fakeContext({ editor });

    expect(COMMANDS.undo.enabled(ctx)).toBe(false);
    expect(COMMANDS.redo.enabled(ctx)).toBe(false);

    editor.dispatch({ changes: { from: 0, insert: "circle\n" }, userEvent: "input" });
    expect(COMMANDS.undo.enabled(ctx)).toBe(true);

    undo(editor);
    expect(COMMANDS.redo.enabled(ctx)).toBe(true);
    redo(editor);
    expect(COMMANDS.redo.enabled(ctx)).toBe(false);
  });
});

describe("what running one does", () => {
  it("delegates each Command to the one thing that owns it", () => {
    const { ctx, ran } = fakeContext();

    for (const id of [
      "new",
      "open",
      "save",
      "saveAs",
      "exportSvg",
      "exportPng",
      "copyDiagram",
      "zoomIn",
      "zoomOut",
      "fit",
      "toggleEditor",
      "toggleTheme",
      "about",
    ] as const) {
      COMMANDS[id].run(ctx);
    }

    expect(ran.calls).toEqual([
      "new",
      "open",
      "save",
      "saveAs",
      "exportSvg",
      "exportPng",
      "copyDiagram",
      "zoomIn",
      "zoomOut",
      "fit",
      "toggleEditor",
      "toggleTheme",
      "about",
    ]);
  });

  it("opens pikchr's manual outside the app, never in a webview", () => {
    const { ctx, ran } = fakeContext();

    COMMANDS.pikchrManual.run(ctx);

    expect(ran.opened).toEqual([PIKCHR_MANUAL_URL]);
  });

  it("walks the Scripts, and stops at both ends rather than wrapping", () => {
    const first = fakeContext({ scriptCount: 3, activeIndex: 0 });
    COMMANDS.prevScript.run(first.ctx);
    COMMANDS.nextScript.run(first.ctx);

    const last = fakeContext({ scriptCount: 3, activeIndex: 2 });
    COMMANDS.nextScript.run(last.ctx);

    expect(first.ran.jumps).toEqual([0, 1]);
    expect(last.ran.jumps).toEqual([2]);
  });

  it("names Show and Hide Editor after what the Command will do", () => {
    expect(COMMANDS.toggleEditor.title(fakeContext({ editorVisible: true }).ctx)).toBe(
      "Hide Editor",
    );
    expect(COMMANDS.toggleEditor.title(fakeContext({ editorVisible: false }).ctx)).toBe(
      "Show Editor",
    );
  });

  it("names the theme it will switch to, not the one it is in", () => {
    expect(COMMANDS.toggleTheme.title(fakeContext({ theme: "light" }).ctx)).toBe("Dark Theme");
    expect(COMMANDS.toggleTheme.title(fakeContext({ theme: "dark" }).ctx)).toBe("Light Theme");
  });
});

describe("the menus", () => {
  it("keep the Edit menu to the desktop, where its items are the OS's", () => {
    const edit = MENUS.find((menu) => menu.title === "Edit");

    expect(edit?.desktopOnly).toBe(true);
    // Undo and Redo are ours on every OS; the other four are the system's.
    expect(edit?.items.filter((item) => item.kind === "command").map((item) => item.id)).toEqual([
      "undo",
      "redo",
    ]);
  });

  it("put Insert Pikchr Diagram in File, directly under New", () => {
    const file = MENUS.find((menu) => menu.title === "File");
    const ids = file?.items.flatMap((item) => (item.kind === "command" ? [item.id] : []));

    expect(ids?.slice(0, 3)).toEqual(["new", "insertFence", "open"]);
  });

  it("carry the two Help items #1100 settled, in order", () => {
    const help = MENUS.find((menu) => menu.title === "Help");

    expect(help?.items.flatMap((item) => (item.kind === "command" ? [item.id] : []))).toEqual([
      "pikchrManual",
      "about",
    ]);
  });

  it("build Recent and the Examples from data rather than from Commands", () => {
    const lists = MENUS.flatMap((menu) =>
      menu.items.flatMap((item) => (item.kind === "list" ? [item.list] : [])),
    );

    expect(lists).toEqual(["recent", "themes", "examples"]);
  });

  it("hold the toolbar's four groups, in #1047's order", () => {
    expect(TOOLBAR).toEqual([
      ["new", "open", "save"],
      ["exportSvg", "copyDiagram"],
      ["zoomOut", "zoomReset", "zoomIn", "fit"],
      ["toggleTheme", "toggleEditor"],
    ]);
  });
});
