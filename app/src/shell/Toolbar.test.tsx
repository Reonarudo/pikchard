import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TOOLBAR } from "../commands/menus.js";
import type { CommandContext } from "../commands/registry.js";
import { Toolbar } from "./Toolbar.js";

let container: HTMLDivElement;
let root: Root;
let ran: string[] = [];
let diagram = true;

function context(editorVisible = true, theme: "light" | "dark" = "light"): CommandContext {
  return {
    state: () =>
      ({
        render: { lastGood: diagram ? { diagram: {}, script: "" } : null },
        scripts: { count: 1, activeIndex: 0 },
        theme,
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
    panzoom: {
      zoomIn: () => ran.push("zoomIn"),
      zoomOut: () => ran.push("zoomOut"),
      actualSize: () => ran.push("actualSize"),
      fit: () => ran.push("fit"),
    } as unknown as CommandContext["panzoom"],
    editor: () => null,
    jumpToScript: () => {},
    toggleEditor: () => ran.push("toggleEditor"),
    openExternal: () => {},
    showAbout: () => {},
    editorVisible,
  };
}

const find = (testid: string) => container.querySelector(`[data-testid='${testid}']`);
const click = (testid: string) => act(() => (find(testid) as HTMLButtonElement).click());

function show(options: { editorVisible?: boolean; theme?: "light" | "dark" } = {}) {
  act(() =>
    root.render(
      <Toolbar
        ctx={context(options.editorVisible ?? true, options.theme ?? "light")}
        zoom="100%"
      />,
    ),
  );
}

beforeEach(() => {
  ran = [];
  diagram = true;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the toolbar", () => {
  it("has a button for every Command in the four groups, in order", () => {
    show();

    expect(
      [...container.querySelectorAll(".toolbar__group")].map((group) => group.children.length),
    ).toEqual(TOOLBAR.map((group) => group.length));
  });

  it("runs the Command behind each button", () => {
    show();

    click("toolbar-new");
    click("toolbar-save");
    click("toolbar-exportSvg");
    click("toolbar-zoomIn");
    click("toolbar-fit");
    click("toolbar-toggleEditor");

    expect(ran).toEqual(["new", "save", "exportSvg", "zoomIn", "fit", "toggleEditor"]);
  });

  it("takes its accessible names from the registry, so they cannot drift", () => {
    show();

    expect(find("toolbar-exportSvg")?.getAttribute("aria-label")).toBe("Export SVG…");
    expect(find("toolbar-zoomReset")?.getAttribute("aria-label")).toBe("Actual Size");
  });

  it("names the two that change after what they will do", () => {
    show({ editorVisible: true, theme: "light" });
    expect(find("toolbar-toggleEditor")?.getAttribute("aria-label")).toBe("Hide Editor");
    expect(find("toolbar-toggleTheme")?.getAttribute("aria-label")).toBe("Dark Theme");

    show({ editorVisible: false });
    expect(find("toolbar-toggleEditor")?.getAttribute("aria-label")).toBe("Show Editor");
  });

  it("shows the zoom on the button back to 100 %", () => {
    show();

    expect(find("toolbar-zoomReset")?.textContent).toBe("100%");
  });

  it("dims what cannot run, keeps it focusable, and does nothing when clicked", () => {
    diagram = false;
    show();

    expect(find("toolbar-exportSvg")?.getAttribute("aria-disabled")).toBe("true");
    expect(find("toolbar-exportSvg")?.hasAttribute("disabled")).toBe(false);
    expect(find("toolbar-zoomIn")?.getAttribute("aria-disabled")).toBe("true");
    // Save is never dimmed: a Document with nowhere to go routes to Save As.
    expect(find("toolbar-save")?.getAttribute("aria-disabled")).toBe("false");

    click("toolbar-exportSvg");

    expect(ran).toEqual([]);
  });

  it("says why a dimmed button cannot run, in #1055's words", () => {
    diagram = false;
    show();

    expect(find("toolbar-exportSvg")?.getAttribute("title")).toBe("Nothing to export yet");
    expect(find("toolbar-copyDiagram")?.getAttribute("title")).toBe("Nothing to copy yet");
    // The zoom four share one reason.
    expect(find("toolbar-zoomIn")?.getAttribute("title")).toBe("No diagram yet");
    expect(find("toolbar-fit")?.getAttribute("title")).toBe("No diagram yet");
    // The spoken name is still the Command's own.
    expect(find("toolbar-exportSvg")?.getAttribute("aria-label")).toBe("Export SVG…");
  });

  it("titles an enabled button with the Command's own name", () => {
    show();

    expect(find("toolbar-exportSvg")?.getAttribute("title")).toBe("Export SVG…");
  });
});
