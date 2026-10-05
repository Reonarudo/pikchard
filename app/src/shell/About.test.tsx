import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { About } from "./About.js";

let container: HTMLDivElement;
let root: Root;
let closed = 0;
let opened = 0;

const find = (testid: string) =>
  container.querySelector(`[data-testid='${testid}']`) as HTMLElement | null;

function show(open: boolean, pikchrVersion: string | null = "1.0 20260403102956") {
  act(() =>
    root.render(
      <About
        open={open}
        pikchrVersion={pikchrVersion}
        onClose={() => {
          closed += 1;
        }}
        onOpenRepository={() => {
          opened += 1;
        }}
      />,
    ),
  );
}

beforeEach(() => {
  closed = 0;
  opened = 0;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("About Pikchard", () => {
  it("puts the focus on its one button when it opens", () => {
    show(true);

    expect(window.document.activeElement).toBe(find("about-close"));
  });

  it("is a real modal dialog, so the browser owns focus and Escape", () => {
    // #1101 guard 4: `showModal()` brings focus containment, the inert backdrop
    // and focus restoration with it. A hand-rolled trap is what this avoids.
    show(true);

    expect((find("about") as HTMLDialogElement).open).toBe(true);
  });

  it("stays shut until it is asked for", () => {
    show(false);

    expect((find("about") as HTMLDialogElement).open).toBe(false);
  });

  it("shows the app's version and the pinned pikchr version", () => {
    show(true);

    expect(find("about-version")?.textContent).toMatch(/^Pikchard \d/);
    expect(find("about-pikchr")?.textContent).toBe("Pikchr 1.0 20260403102956");
  });

  it("waits for the renderer rather than claiming a version it does not have", () => {
    show(true, null);

    expect(find("about-pikchr")?.textContent).toBe("Pikchr …");
  });

  it("carries only what #1100 allowed: no updates, no credits", () => {
    show(true);

    expect(container.textContent).toContain("MIT · pikchr is 0BSD");
    expect(container.textContent).not.toMatch(/update/i);
    expect(container.textContent).not.toMatch(/credit|thanks|acknowledge/i);
  });

  it("opens the repository through the Platform rather than navigating away", () => {
    show(true);

    act(() => (find("about-repository") as HTMLButtonElement).click());

    expect(opened).toBe(1);
  });

  it("closes when asked, and tells the app that it did", () => {
    show(true);

    act(() => (find("about-close") as HTMLButtonElement).click());

    expect(closed).toBe(1);
  });
});
