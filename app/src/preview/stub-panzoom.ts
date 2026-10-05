/**
 * A PanZoom test double, for the components that only read a viewport and call
 * back into it. Not exported from anywhere the app imports — like the Platform
 * and Renderer doubles, it is a test's tool.
 *
 * The real hook is exercised by `panzoom.test.tsx`; what the Preview, the
 * status bar and the toolbar need from it is a viewport to read and a record
 * of what they called.
 */

import type { PanZoom } from "./panzoom.js";

export function stubPanZoom(overrides: Partial<PanZoom> = {}): {
  panzoom: PanZoom;
  /** The names of the viewport methods the component called, in order. */
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    panzoom: {
      attach: () => {},
      viewport: { scale: 1, x: 0, y: 0 },
      manual: false,
      fit: () => calls.push("fit"),
      actualSize: () => calls.push("actualSize"),
      zoomIn: () => calls.push("zoomIn"),
      zoomOut: () => calls.push("zoomOut"),
      handlers: { onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {} },
      ...overrides,
    },
  };
}
