/**
 * The Diagram as a file someone else can open (#1021, #1055).
 *
 * A rewrite of the last-good Diagram and never a second Render: the file must be
 * the picture the user is looking at, and re-rendering could produce a different
 * one — the Script may have changed, or stopped parsing, since.
 *
 * What the rewrite is for is that an SVG *on screen* lives inside the app: it
 * inherits the page's font, sits on the app's background and carries the
 * `data-pik` offsets the direct-manipulation work needs (ADR 0005). As a file it
 * has none of that — SVG-as-image runs in secure static mode, with no
 * stylesheet, no web fonts and no external references — so everything it needs
 * has to be written into it, and everything it does not need comes out.
 */

import type { Diagram } from "../render/render.js";
import type { Theme } from "../store.js";

/**
 * The font stack the Preview shows the Diagram in, written into the file as a
 * presentation attribute on the root.
 *
 * A presentation attribute rather than a `style`, because it must lose to
 * pikchr's own `font-family="monospace"` on `mono` text: that is a declaration
 * on the element, and this is a value its children inherit.
 *
 * **No embedded fonts.** Only faces installed on the machine resolve, so the
 * file matches the Preview on the same machine — not byte-for-byte across
 * machines. That is the cost of not embedding, and #1055 accepted it.
 */
export const DIAGRAM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * The surface an exported Diagram sits on, per theme — the app's own `--bg`
 * (`index.css`), because a file that disagreed with the Preview would look like
 * a bug rather than like an export.
 *
 * Light is used by the PNG alone: an SVG stays transparent there, which is what
 * makes it droppable into someone else's document. Dark is mandatory in both
 * formats, a dark Render being light ink.
 */
export const EXPORT_BACKGROUND: Record<Theme, string> = { light: "#ffffff", dark: "#1b1b1b" };

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The Diagram, rewritten for export. A standalone SVG document: no prolog, no
 * DOCTYPE and no generated-by comment — `xmlns` is all a browser, Inkscape or
 * Figma needs, and the rest is bytes nobody reads.
 */
export function exportableSvg(diagram: Diagram, theme: Theme): string {
  const parsed = new DOMParser().parseFromString(diagram.svg, "image/svg+xml");
  const root = parsed.documentElement;

  // The renderer's size, overwriting pikchr's own — which it sets only when the
  // Script's `scale` is not 1, and then in its own units.
  root.setAttribute("width", String(diagram.width));
  root.setAttribute("height", String(diagram.height));
  root.setAttribute("font-family", DIAGRAM_FONT);

  for (const element of root.querySelectorAll("[data-pik]")) {
    element.removeAttribute("data-pik");
  }

  if (theme === "dark") {
    root.insertBefore(backgroundRect(parsed, root), root.firstChild);
  }

  return new XMLSerializer().serializeToString(root);
}

/**
 * An opaque rectangle over the whole viewBox, as the first child so everything
 * else draws on top of it.
 *
 * In viewBox units, not pixels: the `width`/`height` above are how large the
 * file is asked to be drawn, and this has to cover the coordinate space the
 * Diagram is actually in.
 */
function backgroundRect(document: Document, root: Element): Element {
  const [, , width = 0, height = 0] = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", EXPORT_BACKGROUND.dark);
  return rect;
}
