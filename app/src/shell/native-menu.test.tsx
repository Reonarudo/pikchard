/**
 * The desktop menu bar, against a `FakePlatform` (#1023, #1053).
 *
 * Possible at all because the menu goes through the Platform seam: what the menu
 * says, what running an item does, and — the one #1053 made a guard — how little
 * gets pushed when nothing changed.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../commands/registry.js";
import { FakePlatform } from "../platform/fake.js";
import type { MenuNodeSpec } from "../platform/types.js";
import { useNativeMenu } from "./native-menu.js";

let container: HTMLDivElement;
let root: Root;
let ran: string[] = [];
let chosen: string[] = [];
let diagram = true;
let editorVisible = true;

const recent = [{ key: "/report.md", name: "report.md" }];
const examples = [{ name: "Flowchart", script: "diamond\n" }];

function context(): CommandContext {
  return {
    state: () =>
      ({
        render: { lastGood: diagram ? { diagram: {}, script: "" } : null },
        scripts: { count: 1, activeIndex: 0 },
        theme: "light",
        toggleTheme: () => ran.push("toggleTheme"),
      }) as unknown as ReturnType<CommandContext["state"]>,
    session: {
      save: async () => {
        ran.push("save");
        return null;
      },
    } as unknown as CommandContext["session"],
    exports: {
      canExport: diagram,
      exportSvg: async () => {
        ran.push("exportSvg");
      },
    } as unknown as CommandContext["exports"],
    panzoom: {} as unknown as CommandContext["panzoom"],
    editor: () => null,
    jumpToScript: () => {},
    toggleEditor: () => ran.push("toggleEditor"),
    openExternal: (url) => ran.push(`open:${url}`),
    showAbout: () => ran.push("about"),
    editorVisible,
  };
}

/** Stable across renders, as the App's module-scoped Platform promise is. */
let hosted: Promise<FakePlatform>;

function Host({ mac }: { mac: boolean }) {
  useNativeMenu({
    platform: hosted,
    ctx: context(),
    recent,
    examples,
    themeChoice: "system",
    onOpenRecent: (entry) => chosen.push(`recent:${entry.key}`),
    onOpenExample: (example) => chosen.push(`example:${example.name}`),
    onChooseTheme: (choice) => chosen.push(`theme:${choice}`),
    onQuit: () => ran.push("quit"),
    mac,
  });
  return null;
}

async function mount(platform: FakePlatform, mac = false) {
  hosted = Promise.resolve(platform);
  await act(async () => {
    root.render(<Host mac={mac} />);
  });
  await act(async () => {});
  return platform;
}

/** Re-render, the way a keystroke does — same Platform, so no rebuild. */
async function rerender(_platform: FakePlatform, mac = false) {
  await act(async () => {
    root.render(<Host mac={mac} />);
  });
  await act(async () => {});
}

/** Every submenu's title, in order. */
const titles = (items: readonly MenuNodeSpec[]) =>
  items.flatMap((item) => (item.kind === "submenu" ? [item.text] : []));

const submenu = (items: readonly MenuNodeSpec[], text: string) =>
  items.find(
    (item): item is Extract<MenuNodeSpec, { kind: "submenu" }> =>
      item.kind === "submenu" && item.text === text,
  );

beforeEach(() => {
  ran = [];
  chosen = [];
  diagram = true;
  editorVisible = true;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the native menu bar", () => {
  it("is not built at all on a Platform that has none", async () => {
    const platform = await mount(new FakePlatform({ kind: "browser" }));

    expect(platform.menu).toBeNull();
  });

  it("carries the same menus as the web, the Edit menu included", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }));

    expect(titles(platform.menu ?? [])).toEqual(["File", "Edit", "View", "Examples", "Help"]);
  });

  it("adds the application submenu on macOS, with About and a Quit of our own", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }), true);

    expect(titles(platform.menu ?? [])[0]).toBe("Pikchard");
    const app = submenu(platform.menu ?? [], "Pikchard");
    const ids = app?.items.flatMap((item) => (item.kind === "item" ? [item.id] : []));
    expect(ids).toEqual(["about", "quit"]);

    platform.clickMenuItem("quit");
    // Quit is ours because the predefined one takes the process without the app
    // ever being asked about unsaved work (#1020).
    expect(ran).toEqual(["quit"]);
  });

  it("gives Undo and Redo as items of our own, never the OS's", async () => {
    // A predefined Undo drives the webview's own undo stack (#1053 guard 2).
    const platform = await mount(new FakePlatform({ kind: "desktop" }));
    const edit = submenu(platform.menu ?? [], "Edit");

    expect(edit?.items.flatMap((item) => (item.kind === "item" ? [item.id] : []))).toEqual([
      "undo",
      "redo",
    ]);
    expect(edit?.items.flatMap((item) => (item.kind === "predefined" ? [item.item] : []))).toEqual([
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
  });

  it("gives each item the accelerator its Shortcut says", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }));
    const file = submenu(platform.menu ?? [], "File");
    const save = file?.items.find((item) => item.kind === "item" && item.id === "save");

    expect(save).toMatchObject({ accelerator: "CmdOrCtrl+S", text: "Save" });
    // Desktop New is plain Mod+N; the web's is the one that needs Alt.
    const newItem = file?.items.find((item) => item.kind === "item" && item.id === "new");
    expect(newItem).toMatchObject({ accelerator: "CmdOrCtrl+N" });
  });

  it("runs the Command behind an item, and nothing when it is disabled", async () => {
    diagram = false;
    const platform = await mount(new FakePlatform({ kind: "desktop" }));

    platform.clickMenuItem("save");
    platform.clickMenuItem("exportSvg");

    expect(ran).toEqual(["save"]);
  });

  it("lists Recent, the Examples and the theme choices from data", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }));

    platform.clickMenuItem("recent:/report.md");
    platform.clickMenuItem("example:Flowchart");
    platform.clickMenuItem("theme:dark");

    expect(chosen).toEqual(["recent:/report.md", "example:Flowchart", "theme:dark"]);
    // The theme choices are check items, and the one in force is checked.
    const view = submenu(platform.menu ?? [], "View");
    expect(
      view?.items.find((item) => item.kind === "item" && item.id === "theme:system"),
    ).toMatchObject({ checked: true });
  });

  it("pushes nothing at all when a render changes nothing", async () => {
    // #1053 guard 7, end to end: a keystroke that flips no Command's enabled state
    // or title makes zero menu IPC calls.
    const platform = await mount(new FakePlatform({ kind: "desktop" }));
    expect(platform.menuPushes).toEqual([]);

    await rerender(platform);

    expect(platform.menuPushes).toEqual([]);
    // And the menu was built once, not again.
    expect(platform.menuBuilds).toBe(1);
  });

  it("pushes only what moved", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }));

    diagram = false;
    await rerender(platform);

    expect(platform.menuPushes).toEqual([
      { id: "exportSvg", enabled: false },
      { id: "exportPng", enabled: false },
      { id: "copyDiagram", enabled: false },
      { id: "zoomIn", enabled: false },
      { id: "zoomOut", enabled: false },
      { id: "zoomReset", enabled: false },
      { id: "fit", enabled: false },
    ]);
  });

  it("pushes a title when only the title moved", async () => {
    const platform = await mount(new FakePlatform({ kind: "desktop" }));

    editorVisible = false;
    await rerender(platform);

    expect(platform.menuPushes).toEqual([{ id: "toggleEditor", text: "Show Editor" }]);
  });
});
