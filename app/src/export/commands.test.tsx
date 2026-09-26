/**
 * Export SVG, Export PNG and Copy Diagram, over a real store and a
 * `FakePlatform` (#1021).
 *
 * The Platform is the fake and the canvas is a stand-in — a jsdom canvas cannot
 * rasterise, and #1055 put the byte-stable PNG in Playwright for that reason.
 * Everything else here is the real thing: the store, the SVG rewrite, the
 * filenames and every Toast.
 */

import type { RenderError } from "@pikchard/pikchr-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NO_SCRIPTS } from "../document/projection.js";
import { FakePlatform } from "../platform/fake.js";
import { useStore } from "../store.js";
import { type ExportCommands, useExportCommands } from "./commands.js";

const initialState = useStore.getState();

let container: HTMLDivElement;
let root: Root;
let commands: ExportCommands;

const diagram = {
  svg: `<svg xmlns='http://www.w3.org/2000/svg' class="pikchr" viewBox="0 0 112 76"><text data-pik="0">box</text></svg>`,
  width: 112,
  height: 76,
};

/** A canvas that produces a recognisable PNG without rasterising anything. */
const fakePng = new Blob(["png-bytes"], { type: "image/png" });

function fakeScope(): typeof globalThis {
  const context = { fillStyle: "", fillRect: () => {}, drawImage: () => {} };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void) => callback(fakePng),
  };
  return {
    URL: { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} },
    Image: class {
      src = "";
      async decode() {}
    },
    document: { createElement: () => canvas },
  } as unknown as typeof globalThis;
}

function Harness({ platform }: { platform: Promise<FakePlatform> }) {
  commands = useExportCommands({ platform, scope: fakeScope() });
  return null;
}

/** Mount the Commands over a Platform, with a Document and a Diagram in the store. */
async function mount(
  platform: FakePlatform,
  state: {
    name?: string;
    scripts?: { count: number; activeIndex: number | null };
    rendered?: boolean;
    error?: boolean;
    theme?: "light" | "dark";
  } = {},
) {
  const {
    name = "flow.pikchr",
    scripts = { count: 1, activeIndex: 0 },
    rendered = true,
    error = false,
    theme = "light",
  } = state;

  useStore.setState({
    document: { ...useStore.getState().document, name },
    scripts: { ...NO_SCRIPTS, ...scripts, text: "box\n" },
    theme,
    render: {
      lastGood: rendered ? { diagram, script: "box\n" } : null,
      error: error ? ({ message: "syntax error" } as RenderError) : null,
      elapsedMs: 1,
    },
  });

  await act(async () => {
    root.render(<Harness platform={Promise.resolve(platform)} />);
  });
}

const settle = async () => {
  await act(async () => {});
  await act(async () => {});
};

const toast = () => useStore.getState().toasts.at(-1)?.message ?? null;

beforeEach(() => {
  useStore.setState(initialState, true);
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Export SVG", () => {
  it("writes the exportable Diagram under the Document's Name, and says nothing", async () => {
    // The dialog was the confirmation; a Toast after it would be noise (#1055).
    const platform = new FakePlatform();
    await mount(platform);

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    expect(platform.exported).toHaveLength(1);
    expect(platform.exported[0]?.suggestedName).toBe("flow.svg");
    expect(platform.exported[0]?.type).toBe("image/svg+xml");
    // The rewrite, not the Diagram as the Preview holds it.
    expect(platform.exported[0]?.text).not.toContain("data-pik");
    expect(platform.exported[0]?.text).toContain('width="112"');
    expect(toast()).toBeNull();
  });

  it("numbers the Script when the Document has several", async () => {
    const platform = new FakePlatform();
    await mount(platform, { name: "report.md", scripts: { count: 3, activeIndex: 1 } });

    await act(async () => {
      await commands.exportSvg();
    });

    expect(platform.exported[0]?.suggestedName).toBe("report-2.svg");
  });

  it("says where the file went when it could only be downloaded", async () => {
    const platform = new FakePlatform({ capabilities: { saveInPlace: false } });
    platform.nextExport = "downloaded";
    await mount(platform);

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    expect(toast()).toBe("Saved to your downloads");
  });

  it("says nothing at all when the dialog was cancelled", async () => {
    const platform = new FakePlatform();
    platform.nextExport = "cancelled";
    await mount(platform);

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    // Cancelling is not an error, and nothing was even rasterised for it.
    expect(platform.exported).toEqual([]);
    expect(toast()).toBeNull();
  });

  it("says so when the write failed", async () => {
    const platform = new FakePlatform();
    platform.exportFile = () => Promise.reject(new Error("disk full"));
    await mount(platform);

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    expect(toast()).toBe("Couldn't save the file");
  });

  it("exports the last Diagram that rendered, and says that is what it did", async () => {
    // One Toast, replacing the silence: the file is not of the text on screen,
    // and that is the only thing the user cannot see for themselves (#1055).
    const platform = new FakePlatform();
    await mount(platform, { error: true });

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    expect(platform.exported).toHaveLength(1);
    expect(toast()).toBe("Exported the last diagram that rendered");
  });

  it("does nothing at all when no Diagram has ever rendered", async () => {
    const platform = new FakePlatform();
    await mount(platform, { rendered: false });

    expect(commands.canExport).toBe(false);

    await act(async () => {
      await commands.exportSvg();
    });
    await settle();

    expect(platform.exported).toEqual([]);
    expect(toast()).toBeNull();
  });

  it("puts a dark Diagram on an opaque background, so its light ink shows", async () => {
    const platform = new FakePlatform();
    await mount(platform, { theme: "dark" });

    await act(async () => {
      await commands.exportSvg();
    });

    expect(platform.exported[0]?.text).toContain('fill="#1b1b1b"');
  });
});

describe("Export PNG", () => {
  it("writes a PNG, named after the Document", async () => {
    const platform = new FakePlatform();
    await mount(platform);

    await act(async () => {
      await commands.exportPng();
    });
    await settle();

    expect(platform.exported[0]?.suggestedName).toBe("flow.png");
    expect(platform.exported[0]?.type).toBe("image/png");
    expect(toast()).toBeNull();
  });
});

describe("Copy Diagram", () => {
  it("offers every flavour, and confirms", async () => {
    const platform = new FakePlatform();
    await mount(platform);

    await act(async () => {
      await commands.copyDiagram();
    });
    await settle();

    expect(platform.clipboard).toHaveLength(1);
    const payload = platform.clipboard[0];
    expect(payload?.svg).toContain("<svg");
    // The plain-text flavour is the SVG markup, not the Script: copying the
    // Script is its own thing, and `later` (#1033).
    expect(payload?.text).toBe(payload?.svg);
    await expect(payload?.png).resolves.toBe(fakePng);
    expect(toast()).toBe("Diagram copied");
  });

  it("copies the last Diagram that rendered, and says that is what it did", async () => {
    const platform = new FakePlatform();
    await mount(platform, { error: true });

    await act(async () => {
      await commands.copyDiagram();
    });
    await settle();

    expect(platform.clipboard).toHaveLength(1);
    expect(toast()).toBe("Copied the last diagram that rendered");
  });

  it("says so when the clipboard refused", async () => {
    const platform = new FakePlatform();
    platform.clipboardWrite = () => Promise.reject(new Error("denied"));
    await mount(platform);

    await act(async () => {
      await commands.copyDiagram();
    });
    await settle();

    expect(toast()).toBe("Couldn't copy the diagram");
  });

  it("does nothing when there is nothing to copy", async () => {
    const platform = new FakePlatform();
    await mount(platform, { rendered: false });

    await act(async () => {
      await commands.copyDiagram();
    });
    await settle();

    expect(platform.clipboard).toEqual([]);
    expect(toast()).toBeNull();
  });
});
