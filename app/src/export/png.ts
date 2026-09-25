/**
 * The Diagram as a bitmap (#1021, #1055).
 *
 * The route is `Blob` → `createObjectURL` → `new Image()` → `decode()` →
 * `drawImage` → `canvas.toBlob`, and each step is chosen rather than habitual:
 *
 * - **`Image`, not `createImageBitmap`**, which rejects for SVG blobs and for
 *   SVG images that have no intrinsic dimensions.
 * - **An explicit destination width and height** on `drawImage`, for the same
 *   reason: without them the engine guesses a size for an SVG image.
 * - **A `blob:` URL**, which is same-origin, so the canvas is never tainted and
 *   `toBlob` cannot throw for that reason.
 *
 * The `scope` is injected the way `BrowserPlatform` injects it — this module is
 * an adapter to four browser APIs, and a test has to be able to present them.
 */

import type { Theme } from "../store.js";
import { EXPORT_BACKGROUND } from "./svg.js";

/**
 * How much bigger than the Diagram a PNG is.
 *
 * Fixed, and deliberately blind to `devicePixelRatio`: a 3× display must not
 * emit a 2.25×-larger file than a 2× one, and output that depends on the display
 * cannot be asserted in Playwright. The Preview's zoom is likewise ignored — it
 * is a viewing state, not an export parameter (#1055).
 */
export const PNG_SCALE = 2;

/** The Diagram's size in CSS pixels, as the renderer computed it. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Rasterise an already-exportable SVG string at {@link PNG_SCALE}, on the
 * theme's opaque surface.
 *
 * Opaque always: a transparent PNG dropped into a document that happens to be
 * dark makes a dark Diagram's light ink invisible, and the file has no theme to
 * follow once it leaves.
 */
export async function rasterise(
  svg: string,
  size: Size,
  theme: Theme,
  scope: typeof globalThis = globalThis,
): Promise<Blob> {
  const width = size.width * PNG_SCALE;
  const height = size.height * PNG_SCALE;

  const url = scope.URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new scope.Image();
    image.src = url;
    // `decode()` rather than an `onload` race: it resolves when the image is
    // ready to be drawn, which is the thing actually being waited for.
    await image.decode();

    const canvas = scope.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context for the export canvas");

    context.fillStyle = EXPORT_BACKGROUND[theme];
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The export canvas produced no PNG"));
      }, "image/png");
    });
  } finally {
    scope.URL.revokeObjectURL(url);
  }
}
