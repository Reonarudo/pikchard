import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UNTITLED } from "../store.js";
import { DocumentTitle, windowTitle } from "./DocumentTitle.js";

let container: HTMLDivElement;
let root: Root;

const find = (selector: string) => container.querySelector(selector) as HTMLElement | null;

const show = (name: string, unsaved: boolean) =>
  act(() => root.render(<DocumentTitle name={name} unsaved={unsaved} />));

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the Document's title", () => {
  it("is the Document's Name", () => {
    show("report.md", false);

    expect(find("[data-testid='document-title']")?.textContent).toBe("report.md");
    expect(find("[data-testid='unsaved-dot']")).toBeNull();
  });

  it("reads Untitled for a Document that never had a Name", () => {
    show(UNTITLED, false);

    expect(find("[data-testid='document-title']")?.textContent).toBe("Untitled");
  });

  it("wears a dot while the Document is Unsaved, and names it aloud", () => {
    show("report.md", true);

    const dot = find("[data-testid='unsaved-dot']");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("aria-label")).toBe("Unsaved work");
  });

  it("loses the dot again the moment it is saved", () => {
    show("report.md", true);

    show("report.md", false);

    expect(find("[data-testid='unsaved-dot']")).toBeNull();
  });
});

describe("what the window is called", () => {
  it("is the Name, and the dot's counterpart when Unsaved", () => {
    expect(windowTitle("report.md", false)).toBe("report.md — Pikchard");
    expect(windowTitle("report.md", true)).toBe("• report.md — Pikchard");
  });
});
