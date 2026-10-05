/**
 * Which Object a click on the Diagram lands on (#1029).
 *
 * By geometry, not by what the browser says is under the pointer. Pikchr draws
 * a box with no fill, so the browser only hits its four edges, and a click in
 * the middle — which plainly means the box — would land on nothing. Each
 * Object's elements carry its statement's offset as `data-pik` (ADR 0005), so
 * the question is only which of their boxes the click is in.
 */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One element of the Diagram that carries `data-pik`, and where it is on screen. */
export interface Candidate {
  /** Its statement's offset in the Script. */
  readonly offset: number;
  readonly rect: Rect;
}

/** How far outside a box, in screen pixels, a click still counts as on it. */
const TOLERANCE = 4;

/**
 * The offset of the Object a click at `point` means, or `null` for empty space.
 *
 * The smallest box that holds the point wins: a circle inside a container is
 * what the user pointed at, not the container around it, and a line — whose box
 * is nearly flat — wins over the box it crosses when the click is right on it.
 * Of two the same size, the later one is drawn on top, and wins.
 */
export function pickObject(
  point: { readonly x: number; readonly y: number },
  candidates: readonly Candidate[],
): number | null {
  let best: { offset: number; area: number } | null = null;
  for (const { offset, rect } of candidates) {
    const inside =
      point.x >= rect.left - TOLERANCE &&
      point.x <= rect.right + TOLERANCE &&
      point.y >= rect.top - TOLERANCE &&
      point.y <= rect.bottom + TOLERANCE;
    if (!inside) continue;
    const area = (rect.right - rect.left) * (rect.bottom - rect.top);
    if (best === null || area <= best.area) best = { offset, area };
  }
  return best?.offset ?? null;
}

/** Every element of a rendered Diagram that carries an offset, where it is now. */
export function candidatesIn(diagram: Element): Candidate[] {
  return [...diagram.querySelectorAll("[data-pik]")].map((element) => ({
    offset: Number(element.getAttribute("data-pik")),
    rect: element.getBoundingClientRect(),
  }));
}

/** The offset of the Object under a click at client `x`, `y`, or `null`. */
export function objectAt(diagram: Element, x: number, y: number): number | null {
  return pickObject({ x, y }, candidatesIn(diagram));
}
