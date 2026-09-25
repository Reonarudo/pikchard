/**
 * Pan, zoom and fit for the Preview (#1016, prototyped in #1047).
 *
 * Hand-rolled rather than taken from a library: the whole of it is one CSS
 * transform on a wrapper sized to the Diagram, and a library would bring an
 * abstraction over gestures we do not have plus a dependency on the Preview's
 * DOM shape, which #1029 will need to own.
 *
 * Auto-fit stays armed until the user zooms or pans by hand, and Fit re-arms
 * it — so a Diagram that grows stays visible without the viewport ever
 * overriding a viewport the user chose themselves.
 */

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** The Diagram's own pixel size, as Pikchr computed it. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where the Diagram sits in the Preview, and how big. */
export interface Viewport {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** Fit never enlarges past this: a two-box Diagram filling the pane is absurd. */
export const MAX_FIT_SCALE = 2;
/** The breathing room Fit leaves around the Diagram, per side. */
const FIT_PADDING = 32;
/** What the toolbar's − and + multiply by. */
const ZOOM_STEP = 1.25;

export interface PanZoom {
  /** Ref callback for the Preview surface — the element gestures happen on. */
  attach(element: HTMLDivElement | null): void;
  viewport: Viewport;
  /** True once the user chose the viewport by hand; auto-fit stays off until Fit. */
  manual: boolean;
  fit(): void;
  /** Back to 100 %, centred — a viewport the user chose, so auto-fit stops. */
  actualSize(): void;
  zoomIn(): void;
  zoomOut(): void;
  handlers: {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
  };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** How far a pointer must travel before it counts as a pan rather than a click. */
const DRAG_SLOP = 2;

export function usePanZoom(size: Size | null): PanZoom {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [manual, setManual] = useState(false);

  // What the gestures need, read through a ref rather than captured: the
  // wheel listener is installed once per surface, and a drag in progress must
  // go on reading the viewport it is moving without being rebuilt under it.
  const latest = useRef({ viewport, size, element });
  latest.current = { viewport, size, element };
  const drag = useRef<{ fromX: number; fromY: number; x: number; y: number } | null>(null);

  const centred = useCallback((scale: number): Viewport => {
    const { element, size } = latest.current;
    if (!element || !size) return { scale, x: 0, y: 0 };
    return {
      scale,
      x: (element.clientWidth - size.width * scale) / 2,
      y: (element.clientHeight - size.height * scale) / 2,
    };
  }, []);

  const fit = useCallback(() => {
    const { element, size } = latest.current;
    if (!element || !size) return;
    const scale = clamp(
      Math.min(
        (element.clientWidth - 2 * FIT_PADDING) / size.width,
        (element.clientHeight - 2 * FIT_PADDING) / size.height,
      ),
      MIN_SCALE,
      MAX_FIT_SCALE,
    );
    setManual(false);
    setViewport(centred(scale));
  }, [centred]);

  const actualSize = useCallback(() => {
    setManual(true);
    setViewport(centred(1));
  }, [centred]);

  /** Zoom by `factor`, keeping the point (`x`, `y`) in the Preview still. */
  const zoomAt = useCallback((factor: number, x: number, y: number) => {
    const { viewport } = latest.current;
    const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
    const applied = scale / viewport.scale;
    setManual(true);
    setViewport({
      scale,
      x: x - (x - viewport.x) * applied,
      y: y - (y - viewport.y) * applied,
    });
  }, []);

  const zoomCentre = useCallback(
    (factor: number) => {
      const { element } = latest.current;
      if (!element) return;
      zoomAt(factor, element.clientWidth / 2, element.clientHeight / 2);
    },
    [zoomAt],
  );

  // Auto-fit when the Diagram's *size* changes, and only then. Most keystrokes
  // that re-render leave the bounding box identical — a renamed label, a new
  // colour — and re-fitting those would be jitter under the cursor. It also
  // makes the theme re-render a viewport no-op, which is what it should be.
  // `element` is a dependency because it arrives from a ref callback, one
  // render *after* the first Diagram: without it the very first fit would be
  // skipped for want of a surface to measure and never retried.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fit` reads the size and the surface through a ref, so they are the triggers rather than captures
  useEffect(() => {
    if (!manual) fit();
  }, [element, size?.width, size?.height, manual, fit]);

  // And when the Preview itself changes size: a window resize, or the split
  // being dragged.
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!manual) fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, manual, fit]);

  // The wheel listener is native and non-passive: a React `onWheel` is passive,
  // and could not stop the page — or the desktop webview — from zooming itself.
  useEffect(() => {
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      // A trackpad pinch arrives as ctrl+wheel with small deltas; a mouse
      // wheel arrives in large notches. Both become the same exponential.
      // `ctrlKey` alone: Cmd+wheel is the browser's own page zoom on macOS,
      // and reading it as a pinch would take a gesture that is not ours.
      const pinch = event.ctrlKey;
      const factor = Math.exp(-event.deltaY * (pinch ? 0.01 : 0.002));
      zoomAt(factor, event.clientX - box.left, event.clientY - box.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element, zoomAt]);

  const handlers = {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const { viewport } = latest.current;
      drag.current = {
        fromX: event.clientX,
        fromY: event.clientY,
        x: viewport.x,
        y: viewport.y,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const started = drag.current;
      if (!started) return;
      const { viewport } = latest.current;
      setViewport({
        scale: viewport.scale,
        x: started.x + (event.clientX - started.fromX),
        y: started.y + (event.clientY - started.fromY),
      });
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      const started = drag.current;
      drag.current = null;
      if (!started) return;
      // A click that did not move is not a pan, and must not disarm auto-fit —
      // #1029 will make that click mean something else entirely.
      const moved = Math.hypot(event.clientX - started.fromX, event.clientY - started.fromY);
      if (moved > DRAG_SLOP) setManual(true);
    },
  };

  return {
    attach: setElement,
    viewport,
    manual,
    fit,
    actualSize,
    zoomIn: () => zoomCentre(ZOOM_STEP),
    zoomOut: () => zoomCentre(1 / ZOOM_STEP),
    handlers,
  };
}

/** How the zoom reads in the toolbar and the status bar. */
export function zoomPercent(viewport: Viewport): string {
  return `${Math.round(viewport.scale * 100)}%`;
}
