import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_FIT_SCALE,
  MAX_SCALE,
  type PanZoom,
  type Size,
  usePanZoom,
  zoomPercent,
} from "./panzoom.js";

/** The Preview surface's size. jsdom lays nothing out, so it is declared. */
const PREVIEW = { width: 400, height: 300 };

let container: HTMLDivElement;
let root: Root;
let panzoom: PanZoom;

function Probe({ size }: { size: Size | null }) {
  panzoom = usePanZoom(size);
  return <div data-testid="surface" ref={panzoom.attach} />;
}

/** Mount (or re-render) the hook over a Diagram of `size`. */
function show(size: Size | null) {
  act(() => root.render(<Probe size={size} />));
}

/** The surface the gestures land on, sized as a real Preview would be. */
function surface(): HTMLDivElement {
  const element = container.querySelector<HTMLDivElement>("[data-testid='surface']");
  if (!element) throw new Error("the Preview surface is not mounted");
  return element;
}

const pointer = (x: number, y: number) => ({
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
  currentTarget: { setPointerCapture: () => {} },
});

/** Drag from one point to another, as a pointer would. */
function drag(fromX: number, fromY: number, toX: number, toY: number) {
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: a pointer event's two fields, not a whole one
    panzoom.handlers.onPointerDown(pointer(fromX, fromY) as any);
    // biome-ignore lint/suspicious/noExplicitAny: as above
    panzoom.handlers.onPointerMove(pointer(toX, toY) as any);
    // biome-ignore lint/suspicious/noExplicitAny: as above
    panzoom.handlers.onPointerUp(pointer(toX, toY) as any);
  });
}

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);

  // jsdom has no layout and no ResizeObserver: both are the environment, not
  // the behaviour, so both are declared here rather than guarded in the hook.
  Object.defineProperty(window.HTMLDivElement.prototype, "clientWidth", {
    configurable: true,
    get: () => PREVIEW.width,
  });
  Object.defineProperty(window.HTMLDivElement.prototype, "clientHeight", {
    configurable: true,
    get: () => PREVIEW.height,
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("fitting the Diagram", () => {
  it("scales it to the Preview, less the padding on each side", () => {
    show({ width: 800, height: 100 });

    // 800 wide into 400 − 2 × 32 gives 0.42; the height is not the constraint.
    expect(panzoom.viewport.scale).toBeCloseTo(0.42);
  });

  it("centres what it fits", () => {
    show({ width: 800, height: 100 });

    const { scale, x, y } = panzoom.viewport;
    expect(x).toBeCloseTo((PREVIEW.width - 800 * scale) / 2);
    expect(y).toBeCloseTo((PREVIEW.height - 100 * scale) / 2);
  });

  it("never blows a small Diagram up past twice its size", () => {
    show({ width: 10, height: 10 });

    expect(panzoom.viewport.scale).toBe(MAX_FIT_SCALE);
  });

  it("re-fits when the Diagram changes size", () => {
    show({ width: 100, height: 100 });
    const before = panzoom.viewport.scale;

    show({ width: 800, height: 800 });

    expect(panzoom.viewport.scale).toBeLessThan(before);
  });
});

describe("choosing the viewport by hand", () => {
  it("steps the zoom in and out about the centre", () => {
    show({ width: 100, height: 100 });
    act(() => panzoom.actualSize());

    act(() => panzoom.zoomIn());
    expect(zoomPercent(panzoom.viewport)).toBe("125%");

    act(() => panzoom.zoomOut());
    expect(zoomPercent(panzoom.viewport)).toBe("100%");
  });

  it("stops zooming in at the limit", () => {
    show({ width: 100, height: 100 });

    for (let i = 0; i < 30; i++) act(() => panzoom.zoomIn());

    expect(panzoom.viewport.scale).toBe(MAX_SCALE);
  });

  it("pans by drag", () => {
    show({ width: 100, height: 100 });
    const { x, y } = panzoom.viewport;

    drag(10, 10, 40, 30);

    expect(panzoom.viewport.x).toBe(x + 30);
    expect(panzoom.viewport.y).toBe(y + 20);
  });

  it("stops auto-fitting once the user has zoomed", () => {
    show({ width: 100, height: 100 });
    act(() => panzoom.zoomIn());
    const chosen = panzoom.viewport;

    show({ width: 800, height: 800 });

    expect(panzoom.viewport).toEqual(chosen);
    expect(panzoom.manual).toBe(true);
  });

  it("stops auto-fitting once the user has panned", () => {
    show({ width: 100, height: 100 });

    drag(10, 10, 60, 10);

    expect(panzoom.manual).toBe(true);
  });

  it("keeps auto-fitting after a click that did not move", () => {
    show({ width: 100, height: 100 });

    drag(10, 10, 11, 10);

    expect(panzoom.manual).toBe(false);
  });

  it("re-arms auto-fit when the user asks for Fit", () => {
    show({ width: 100, height: 100 });
    act(() => panzoom.zoomIn());

    act(() => panzoom.fit());

    expect(panzoom.manual).toBe(false);
    expect(panzoom.viewport.scale).toBe(MAX_FIT_SCALE);
  });

  it("zooms at the pointer on a wheel, leaving that point where it was", () => {
    show({ width: 100, height: 100 });
    act(() => panzoom.actualSize());
    const before = panzoom.viewport;

    act(() => {
      surface().dispatchEvent(
        new window.WheelEvent("wheel", { deltaY: -100, clientX: 0, clientY: 0, bubbles: true }),
      );
    });

    const after = panzoom.viewport;
    expect(after.scale).toBeGreaterThan(before.scale);
    // The Diagram point under (0,0) has not moved, so x and y scale with it.
    expect(after.x).toBeCloseTo(before.x * (after.scale / before.scale));
  });
});

describe("with nothing rendered", () => {
  it("leaves the viewport alone", () => {
    show(null);

    expect(panzoom.viewport).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
