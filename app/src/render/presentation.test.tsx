import type { RenderError } from "@pikchard/pikchr-wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_QUIET_MS, usePresentedError } from "./presentation.js";

const error = (message = "syntax error"): RenderError => ({ message, span: { from: 0, to: 1 } });

let container: HTMLDivElement;
let root: Root;
/** What the hook returned on its most recent render. */
let presented: RenderError | null = null;

/**
 * One component for the whole suite, so re-rendering it keeps the hook's
 * state — a second component type would remount and forget what came before,
 * which is exactly what the hook is remembering.
 */
function Probe({
  error,
  text,
  activeIndex,
}: {
  error: RenderError | null;
  text: string;
  activeIndex: number | null;
}) {
  presented = usePresentedError(error, text, activeIndex);
  return null;
}

/** Render the hook over one (error, text, Active Script) triple. */
function show(error: RenderError | null, text: string, activeIndex = 0) {
  act(() => root.render(<Probe error={error} text={text} activeIndex={activeIndex} />));
}

beforeEach(() => {
  vi.useFakeTimers();
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  presented = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("presenting a Render Error", () => {
  it("shows a failure the user did not type — an already-broken Script", () => {
    show(error(), "boom\n");

    expect(presented).not.toBeNull();
  });

  it("holds a failure back while the text is still being typed", () => {
    show(null, "box\n");

    show(error(), "box\nb\n");

    expect(presented).toBeNull();
  });

  it("shows it once the text has been quiet", () => {
    show(null, "box\n");
    show(error(), "box\nb\n");

    act(() => vi.advanceTimersByTime(ERROR_QUIET_MS));

    expect(presented?.message).toBe("syntax error");
  });

  it("never shows an error the user has already typed past", () => {
    show(null, "box\n");
    show(error(), "box\nb\n");
    act(() => vi.advanceTimersByTime(ERROR_QUIET_MS - 50));

    show(null, "box\nbox\n");
    act(() => vi.advanceTimersByTime(ERROR_QUIET_MS));

    expect(presented).toBeNull();
  });

  it("starts the wait again on each keystroke", () => {
    show(null, "box\n");
    show(error("first"), "box\nb\n");
    act(() => vi.advanceTimersByTime(ERROR_QUIET_MS - 50));

    show(error("second"), "box\nbo\n");
    act(() => vi.advanceTimersByTime(ERROR_QUIET_MS - 50));
    expect(presented).toBeNull();

    act(() => vi.advanceTimersByTime(50));
    expect(presented?.message).toBe("second");
  });

  it("shows a failure at once when a different Script becomes Active", () => {
    show(null, "box\n", 0);

    show(error(), "boom\n", 1);

    expect(presented).not.toBeNull();
  });

  it("clears the failure as soon as the text renders again", () => {
    show(error(), "boom\n");

    show(null, "box\n");

    expect(presented).toBeNull();
  });
});
