import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codeMirrorKey, useCommandShortcuts } from "./dispatch.js";
import type { CommandContext } from "./registry.js";

let container: HTMLDivElement;
let root: Root;
let ran: string[] = [];
let diagram = true;

/** A context that records which Command ran, and can withhold the Diagram. */
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
    panzoom: {
      zoomIn: () => ran.push("zoomIn"),
      zoomOut: () => ran.push("zoomOut"),
      actualSize: () => ran.push("actualSize"),
      fit: () => ran.push("fit"),
    } as unknown as CommandContext["panzoom"],
    editor: () => null,
    jumpToScript: () => ran.push("jump"),
    toggleEditor: () => ran.push("toggleEditor"),
    openExternal: () => ran.push("openExternal"),
    showAbout: () => ran.push("about"),
    editorVisible: true,
  };
}

function Host({ kind }: { kind: "browser" | "desktop" }) {
  useCommandShortcuts(() => context(), kind);
  return null;
}

/** Press a key on `target`, and say whether anything claimed it. */
function press(init: KeyboardEventInit, target: EventTarget = window.document.body): boolean {
  const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

beforeEach(() => {
  ran = [];
  diagram = true;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Host kind="browser" />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a Shortcut pressed outside the editor", () => {
  it("runs its Command, and takes the key off the browser", () => {
    expect(press({ key: "s", metaKey: true })).toBe(true);
    press({ key: "o", metaKey: true });
    press({ key: "e", metaKey: true });
    press({ key: "e", metaKey: true, shiftKey: true });
    press({ key: "c", metaKey: true, shiftKey: true });
    press({ key: "b", metaKey: true });
    press({ key: "d", metaKey: true, shiftKey: true });

    expect(ran).toEqual([
      "save",
      "open",
      "exportSvg",
      "exportPng",
      "copyDiagram",
      "toggleEditor",
      "toggleTheme",
    ]);
  });

  it("zooms on every key a user would press for it", () => {
    press({ key: "=", metaKey: true });
    // The main-row `+` is Shift+`=`, and it is still Zoom In.
    press({ key: "+", metaKey: true, shiftKey: true });
    press({ key: "-", metaKey: true });
    press({ key: "0", metaKey: true });
    press({ key: "1", metaKey: true });

    expect(ran).toEqual(["zoomIn", "zoomIn", "zoomOut", "actualSize", "fit"]);
  });

  it("asks for Alt as well on the web, where the browser owns Mod+N", () => {
    press({ key: "n", metaKey: true });
    expect(ran).toEqual([]);

    press({ key: "n", metaKey: true, altKey: true });
    expect(ran).toEqual(["new"]);
  });

  it("claims the key even where the Command cannot act, rather than letting it through", () => {
    // Mod+E with no Diagram must not fall through to the browser's own binding.
    diagram = false;

    expect(press({ key: "e", metaKey: true })).toBe(true);
    expect(ran).toEqual([]);
  });

  it("leaves a key no Command claims alone", () => {
    expect(press({ key: "k", metaKey: true })).toBe(false);
    expect(ran).toEqual([]);
  });
});

describe("a Shortcut pressed inside the editor", () => {
  it("is left to CodeMirror, so no Command runs twice", () => {
    // The editor's own keymap has these; handling them here as well would run
    // every Command a second time (#1053).
    const editor = window.document.createElement("div");
    editor.className = "cm-editor";
    const content = window.document.createElement("div");
    editor.append(content);
    container.append(editor);

    press({ key: "s", metaKey: true }, content);

    expect(ran).toEqual([]);
  });
});

describe("a Shortcut as CodeMirror spells it", () => {
  it("is Mod, Alt, Shift and the key", () => {
    expect(codeMirrorKey({ mod: true, key: "s" })).toBe("Mod-s");
    expect(codeMirrorKey({ mod: true, shift: true, key: "e" })).toBe("Mod-Shift-e");
    expect(codeMirrorKey({ mod: true, alt: true, key: "arrowdown" })).toBe("Mod-Alt-ArrowDown");
    expect(codeMirrorKey({ mod: true, key: "=" })).toBe("Mod-=");
  });
});
