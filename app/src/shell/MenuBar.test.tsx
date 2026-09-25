import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MENUS } from "../commands/menus.js";
import type { CommandContext } from "../commands/registry.js";
import type { DocumentRef, PlatformKind } from "../platform/types.js";
import { MenuBar } from "./MenuBar.js";

let container: HTMLDivElement;
let root: Root;
let ran: string[] = [];
let chosen: string[] = [];
let diagram = true;

const recent: DocumentRef[] = [{ key: "/report.md", name: "report.md" }];
const examples = [{ name: "Boxes and arrows", script: "box\n" }];

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
      newDocument: async () => {
        ran.push("new");
      },
      open: async () => {
        ran.push("open");
      },
      save: async () => {
        ran.push("save");
        return null;
      },
      saveAs: async () => {
        ran.push("saveAs");
        return null;
      },
    } as unknown as CommandContext["session"],
    exports: {
      canExport: diagram,
      exportSvg: async () => {
        ran.push("exportSvg");
      },
      exportPng: async () => {
        ran.push("exportPng");
      },
      copyDiagram: async () => {
        ran.push("copyDiagram");
      },
    },
    panzoom: {} as unknown as CommandContext["panzoom"],
    editor: () => null,
    jumpToScript: () => {},
    toggleEditor: () => ran.push("toggleEditor"),
    openExternal: () => ran.push("manual"),
    showAbout: () => ran.push("about"),
    editorVisible: true,
  };
}

const find = (testid: string) => container.querySelector(`[data-testid='${testid}']`);
const click = (testid: string) => act(() => (find(testid) as HTMLButtonElement).click());

function show(kind: PlatformKind = "browser", showsRecent = true) {
  act(() =>
    root.render(
      <MenuBar
        menus={MENUS}
        kind={kind}
        ctx={context()}
        recent={recent}
        showsRecent={showsRecent}
        examples={examples}
        themeChoice="system"
        onOpenRecent={(entry) => chosen.push(`recent:${entry.key}`)}
        onOpenExample={(example) => chosen.push(`example:${example.name}`)}
        onChooseTheme={(choice) => chosen.push(`theme:${choice}`)}
      />,
    ),
  );
}

beforeEach(() => {
  ran = [];
  chosen = [];
  diagram = true;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the web menu bar", () => {
  it("shows the menus the web has, and not the Edit menu, which is the OS's", () => {
    show();

    expect(find("file-menu")).not.toBeNull();
    expect(find("view-menu")).not.toBeNull();
    expect(find("examples-menu")).not.toBeNull();
    expect(find("help-menu")).not.toBeNull();
    expect(find("edit-menu")).toBeNull();
  });

  it("shows nothing at all on the desktop, where the native menu carries them", () => {
    show("desktop");

    expect(container.textContent).toBe("");
  });

  it("runs the Command an item stands for, and closes", () => {
    show();
    click("file-menu");

    click("command-save");

    expect(ran).toEqual(["save"]);
    expect(find("file-menu-items")).toBeNull();
  });

  it("shows each item's Shortcut beside it", () => {
    show();
    click("file-menu");

    // The web build's own New, which asks for Alt because the browser owns Mod+N.
    expect(find("command-new")?.querySelector("kbd")?.textContent).toMatch(/N$/);
    expect(find("command-save")?.querySelector("kbd")?.textContent).toMatch(/S$/);
    // Three Commands have no Shortcut at all, and show none.
    click("file-menu");
    click("help-menu");
    expect(find("command-about")?.querySelector("kbd")).toBeNull();
  });

  it("dims an item whose Command cannot act, and does nothing when it is clicked", () => {
    diagram = false;
    show();
    click("file-menu");

    expect(find("command-exportSvg")?.getAttribute("aria-disabled")).toBe("true");
    click("command-exportSvg");

    expect(ran).toEqual([]);
    // Dimmed, not removed, and the menu stays open on a click that did nothing.
    expect(find("command-exportSvg")).not.toBeNull();
  });

  it("claims no ARIA menu semantics anywhere, because it implements none of them", () => {
    // `role="menu"` and its items promise arrow-key navigation this deliberately
    // does not have (#1101 guard 1) — the theme radios included.
    show();
    click("file-menu");
    click("view-menu");

    expect(container.querySelector("[role^='menu']")).toBeNull();
    expect(find("file-menu")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("lists Recent in the File menu, and opens the entry clicked", () => {
    show();
    click("file-menu");

    click("recent-/report.md");

    expect(chosen).toEqual(["recent:/report.md"]);
  });

  it("leaves Recent out entirely where the Platform keeps none", () => {
    show("browser", false);
    click("file-menu");

    expect(find("recent-/report.md")).toBeNull();
    expect(container.textContent).not.toContain("Recent");
  });

  it("lists the Examples, and opens the one clicked", () => {
    show();
    click("examples-menu");

    click("example-boxes-and-arrows");

    expect(chosen).toEqual(["example:Boxes and arrows"]);
  });

  it("offers the three theme choices as one set of radios", () => {
    show();
    click("view-menu");

    // Real radios, in one named group: the browser supplies the arrow keys.
    const system = find("theme-system") as HTMLInputElement;
    expect(system.type).toBe("radio");
    expect(system.checked).toBe(true);
    expect((find("theme-light") as HTMLInputElement).checked).toBe(false);
    expect(system.closest("fieldset")?.querySelector("legend")?.textContent).toBe("Theme");

    click("theme-dark");

    expect(chosen).toEqual(["theme:dark"]);
  });

  it("closes on Escape, and gives focus back to the button that opened it", () => {
    show();
    click("file-menu");

    act(() => {
      window.document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(find("file-menu-items")).toBeNull();
    expect(window.document.activeElement).toBe(find("file-menu"));
  });
});
