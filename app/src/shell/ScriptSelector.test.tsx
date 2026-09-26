import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptSelector } from "./ScriptSelector.js";

let container: HTMLDivElement;
let root: Root;

const find = (selector: string) => container.querySelector(selector) as HTMLElement | null;
const click = (testid: string) =>
  act(() => (find(`[data-testid='${testid}']`) as HTMLButtonElement).click());

function show(options: { count: number; activeIndex: number | null }) {
  const jumped: number[] = [];
  act(() =>
    root.render(
      <ScriptSelector
        count={options.count}
        activeIndex={options.activeIndex}
        onJump={(index) => jumped.push(index)}
      />,
    ),
  );
  return jumped;
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

describe("the Script selector", () => {
  it("says nothing at all about a Document with no Scripts", () => {
    show({ count: 0, activeIndex: null });

    expect(find("[data-testid='script-selector']")).toBeNull();
    expect(find("[data-testid='script-count']")).toBeNull();
  });

  it("counts a single Script rather than offering to choose it", () => {
    // A `.pikchr` Document, and most Markdown ones: there is nowhere to jump to,
    // so the cell states the fact and is not a control (#1047).
    show({ count: 1, activeIndex: 0 });

    expect(find("[data-testid='script-count']")?.textContent).toBe("1 Script");
    expect(find("[data-testid='script-selector']")).toBeNull();
  });

  it("names which Script of how many is Active", () => {
    show({ count: 3, activeIndex: 1 });

    expect(find("[data-testid='script-selector']")?.textContent).toBe("Script 2 of 3");
  });

  it("stays shut until it is opened", () => {
    show({ count: 3, activeIndex: 0 });

    expect(find("[data-testid='script-selector-items']")).toBeNull();
    expect(find("[data-testid='script-selector']")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists every Script, and jumps to the one chosen", () => {
    const jumped = show({ count: 3, activeIndex: 0 });
    click("script-selector");

    expect(
      [...container.querySelectorAll("[data-testid='script-selector-items'] button")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Script 1", "Script 2", "Script 3"]);

    click("script-3");

    // The index is zero-based, as every Script index in the app is; only the
    // words the user reads count from one.
    expect(jumped).toEqual([2]);
    expect(find("[data-testid='script-selector-items']")).toBeNull();
  });

  it("marks the Active Script in the list, so the jump is a choice from where you are", () => {
    show({ count: 3, activeIndex: 1 });
    click("script-selector");

    expect(find("[data-testid='script-2']")?.getAttribute("aria-current")).toBe("true");
    expect(find("[data-testid='script-1']")?.getAttribute("aria-current")).toBeNull();
  });

  it("closes on Escape and gives focus back to the cell it came from", () => {
    show({ count: 2, activeIndex: 0 });
    click("script-selector");

    act(() => {
      window.document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(find("[data-testid='script-selector-items']")).toBeNull();
    expect(window.document.activeElement).toBe(find("[data-testid='script-selector']"));
  });
});
