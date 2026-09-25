import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToastNotice } from "../store.js";
import { LONG_TOAST_MS, TOAST_MS, Toasts } from "./Toast.js";

let container: HTMLDivElement;
let root: Root;
let dismissed: number[] = [];

const shown = () =>
  [...container.querySelectorAll("[data-testid='toast']")].map((toast) => toast.textContent);
const show = (notices: readonly ToastNotice[]) =>
  act(() => {
    root.render(<Toasts notices={notices} onDismiss={(id) => dismissed.push(id)} />);
  });

beforeEach(() => {
  vi.useFakeTimers();
  dismissed = [];
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("the Toasts", () => {
  it("are not there when nothing has happened", () => {
    show([]);

    expect(shown()).toEqual([]);
  });

  it("say what happened", () => {
    show([{ id: 1, message: "Saved to your downloads" }]);

    expect(shown()).toEqual(["Saved to your downloads"]);
  });

  it("stay for about two and a half seconds, which #1047 settled", () => {
    // Long enough to read a filename in, and short enough that copy is what gets
    // cut to fit it, not the other way round (#1100).
    expect(TOAST_MS).toBe(2500);
  });

  it("go on their own, asking nothing", () => {
    show([{ id: 1, message: "Saved to your downloads" }]);

    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });

    expect(dismissed).toEqual([1]);
  });

  it("stack, newest last, each on its own clock", () => {
    // #1047: they stack. A second notice neither replaces the first nor resets it.
    show([{ id: 1, message: "Opened 1 of 3 files — Pikchard opens one at a time" }]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    show([
      { id: 1, message: "Opened 1 of 3 files — Pikchard opens one at a time" },
      { id: 2, message: "Can't save notes.md" },
    ]);

    expect(shown()).toEqual([
      "Opened 1 of 3 files — Pikchard opens one at a time",
      "Can't save notes.md",
    ]);

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1000);
    });
    expect(dismissed).toEqual([1]);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(dismissed).toEqual([1, 2]);
  });

  it("give the same words twice over a full time each", () => {
    // Counted, not compared: clicking a Recent entry whose file is still missing
    // has to say so again (#1100).
    show([{ id: 1, message: "notes.md has moved or been deleted — removed from Recent" }]);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    show([
      { id: 1, message: "notes.md has moved or been deleted — removed from Recent" },
      { id: 2, message: "notes.md has moved or been deleted — removed from Recent" },
    ]);
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(dismissed).toEqual([1]);
  });

  it("share the app's one live region, which is polite and never interrupts", () => {
    // #1101 guard 10: exactly one live region in the whole app. A stack of
    // `<output>` elements would be one per Toast, so the stack is the region.
    show([
      { id: 1, message: "Saved to your downloads" },
      { id: 2, message: "Diagram copied" },
    ]);

    const regions = container.querySelectorAll("[aria-live], output, [role='status']");
    expect(regions).toHaveLength(1);
    expect(regions[0]?.getAttribute("aria-live")).toBe("polite");
  });

  it("keep the live region in place while empty, so the first Toast is announced", () => {
    // A region that appears *with* its content is often not announced at all.
    show([]);

    expect(container.querySelector("[aria-live='polite']")).not.toBeNull();
  });
});

describe("a Toast that asks for a decision", () => {
  const update = (run: () => void): ToastNotice => ({
    id: 1,
    message: "A new version of Pikchard is ready",
    action: { label: "Reload", run },
  });

  it("offers the action as a button beside what it says", () => {
    show([update(() => {})]);

    const button = container.querySelector<HTMLButtonElement>("[data-testid='toast-action']");
    expect(button?.textContent).toBe("Reload");
    expect(container.querySelector("[data-testid='toast']")?.textContent).toContain(
      "A new version of Pikchard is ready",
    );
  });

  it("never goes on its own, so the keyboard can always reach it", () => {
    // #1101 guard 11: an interactive control inside a 2.5 s dwell is out of
    // reach of the keyboard. It waits for as long as the user does (#1025).
    show([update(() => {})]);

    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 100);
    });

    expect(dismissed).toEqual([]);
  });

  it("does what it offers, and goes", () => {
    let ran = 0;
    show([update(() => ran++)]);

    act(() => {
      container.querySelector<HTMLButtonElement>("[data-testid='toast-action']")?.click();
    });

    expect(ran).toBe(1);
    expect(dismissed).toEqual([1]);
  });
});

describe("a Toast too long to read in the usual dwell", () => {
  it("stays long enough to be read, and then goes on its own", () => {
    // The iOS Home Screen hint breaks the eight-word ceiling deliberately — it
    // must name both the gesture and the reason (#1025, #1100) — so it is
    // given the time its words take.
    show([
      {
        id: 1,
        message: "Add Pikchard to your Home Screen to keep unsaved work for longer",
        lingers: true,
      },
    ]);

    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(dismissed).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(LONG_TOAST_MS - TOAST_MS);
    });
    expect(dismissed).toEqual([1]);
  });
});
