import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStore } from "../platform/storage.js";
import {
  clampEditorWidth,
  DEFAULT_EDITOR_WIDTH,
  MIN_EDITOR_WIDTH,
  readEditorWidth,
  SPLIT_STORAGE_KEY,
  type Split,
  useSplit,
  writeEditorWidth,
} from "./split.js";

let container: HTMLDivElement;
let root: Root;
let split: Split;

function Host({ storage }: { storage: ReturnType<typeof memoryStore> }) {
  split = useSplit(storage);
  return null;
}

function mount(storage = memoryStore()) {
  act(() => root.render(<Host storage={storage} />));
  return storage;
}

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("where the gutter may go", () => {
  it("keeps the editor wide enough to be one", () => {
    expect(clampEditorWidth(50, 1200)).toBe(MIN_EDITOR_WIDTH);
  });

  it("always leaves the Preview something to show a Diagram in", () => {
    expect(clampEditorWidth(1190, 1200)).toBe(960);
  });

  it("gives the editor its minimum even in a window too narrow for both", () => {
    expect(clampEditorWidth(400, 300)).toBe(MIN_EDITOR_WIDTH);
  });
});

describe("the split across sessions", () => {
  it("starts where #1047 put it", () => {
    expect(readEditorWidth(memoryStore())).toBe(DEFAULT_EDITOR_WIDTH);
  });

  it("comes back where the user left it", () => {
    const storage = memoryStore();

    writeEditorWidth(612, storage);

    expect(readEditorWidth(storage)).toBe(612);
  });

  it("ignores a kept value it cannot use, rather than starting broken", () => {
    const storage = memoryStore();
    storage.setItem(SPLIT_STORAGE_KEY, "narrow");

    expect(readEditorWidth(storage)).toBe(DEFAULT_EDITOR_WIDTH);

    storage.setItem(SPLIT_STORAGE_KEY, "12");
    expect(readEditorWidth(storage)).toBe(DEFAULT_EDITOR_WIDTH);
  });

  it("survives a host with no storage at all", () => {
    expect(readEditorWidth(null)).toBe(DEFAULT_EDITOR_WIDTH);
    expect(() => writeEditorWidth(500, null)).not.toThrow();
  });
});

describe("dragging, resetting and hiding", () => {
  it("remembers a drag for the next session", () => {
    const storage = mount();

    act(() => split.dragTo(700, 1200));

    expect(split.editorWidth).toBe(700);
    expect(readEditorWidth(storage)).toBe(700);
  });

  it("goes back to the default on a double-click", () => {
    mount();
    act(() => split.dragTo(700, 1200));

    act(() => split.reset());

    expect(split.editorWidth).toBe(DEFAULT_EDITOR_WIDTH);
  });

  it("collapses the editor to nothing, and brings it back where it was", () => {
    mount();
    act(() => split.dragTo(700, 1200));

    act(() => split.toggleEditor());
    expect(split.editorWidth).toBe(0);
    expect(split.editorVisible).toBe(false);

    act(() => split.toggleEditor());
    expect(split.editorWidth).toBe(700);
  });

  it("opens on the width it was left at", () => {
    const storage = memoryStore();
    writeEditorWidth(540, storage);

    mount(storage);

    expect(split.editorWidth).toBe(540);
  });
});
