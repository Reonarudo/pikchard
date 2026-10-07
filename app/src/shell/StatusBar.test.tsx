import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NO_SCRIPTS } from "../document/projection.js";
import { stubPanZoom } from "../preview/stub-panzoom.js";
import type { PresentedError } from "../render/presentation.js";
import { StatusBar, type StatusBarProps } from "./StatusBar.js";

const error: PresentedError = { message: "syntax error", position: { line: 12, col: 4 } };

let container: HTMLDivElement;
let root: Root;
let jumps = 0;
let jumpedToScript: number[] = [];

function showStatus(props: Partial<StatusBarProps> = {}) {
  act(() =>
    root.render(
      <StatusBar
        elapsedMs={3.149}
        error={null}
        panzoom={stubPanZoom().panzoom}
        scripts={{ ...NO_SCRIPTS, count: 1, activeIndex: 0 }}
        cursor={{ line: 3, col: 5 }}
        theme="light"
        onJumpToError={() => {
          jumps++;
        }}
        onJumpToScript={(index) => jumpedToScript.push(index)}
        {...props}
      />,
    ),
  );
}

const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
const click = (selector: string) =>
  act(() => (container.querySelector(selector) as HTMLButtonElement).click());

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  jumps = 0;
  jumpedToScript = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the status bar's Render cell", () => {
  it("reports how long the last Render took", () => {
    showStatus();

    expect(text("[data-testid='status-render']")).toBe("Rendered in 3.1 ms");
  });

  it("reports where the current text fails instead", () => {
    showStatus({ error });

    expect(text("[data-testid='status-render']")).toBe("Error at 12:4");
  });

  it("takes the cursor to the error when clicked", () => {
    showStatus({ error });

    click("[data-testid='status-render']");

    expect(jumps).toBe(1);
  });

  it("says nothing before the first Render", () => {
    showStatus({ elapsedMs: null });

    expect(container.querySelector("[data-testid='status-render']")).toBeNull();
  });
});

describe("the status bar's zoom reading", () => {
  it("says the Preview is fitting while auto-fit is armed", () => {
    showStatus({ panzoom: stubPanZoom({ viewport: { scale: 2, x: 0, y: 0 } }).panzoom });

    expect(text("[data-testid='status-zoom']")).toBe("200% · fit");
  });

  it("says only the zoom once the user has chosen it", () => {
    showStatus({ panzoom: stubPanZoom({ manual: true }).panzoom });

    expect(text("[data-testid='status-zoom']")).toBe("100%");
  });
});

describe("the status bar's Script cell", () => {
  it("counts a lone Script", () => {
    showStatus({ scripts: { ...NO_SCRIPTS, count: 1, activeIndex: 0 } });

    expect(text("[data-testid='script-count']")).toBe("1 Script");
  });

  it("offers the Scripts of a Markdown Document, and jumps to the one chosen", () => {
    showStatus({ scripts: { ...NO_SCRIPTS, count: 2, activeIndex: 1 } });

    expect(text("[data-testid='script-selector']")).toBe("Script 2 of 2");

    click("[data-testid='script-selector']");
    click("[data-testid='script-1']");

    expect(jumpedToScript).toEqual([0]);
  });

  it("says nothing about a Document with no Scripts", () => {
    showStatus({ scripts: NO_SCRIPTS });

    expect(container.querySelector("[data-testid='script-count']")).toBeNull();
    expect(container.querySelector("[data-testid='script-selector']")).toBeNull();
  });
});

describe("the status bar's cursor and theme cells", () => {
  it("says where the cursor is, counting from one", () => {
    showStatus({ cursor: { line: 3, col: 5 } });

    expect(text("[data-testid='status-cursor']")).toBe("Ln 3, Col 5");
  });

  it("names the theme it is in", () => {
    showStatus({ theme: "dark" });

    expect(text("[data-testid='status-theme']")).toBe("Dark");
  });
});
