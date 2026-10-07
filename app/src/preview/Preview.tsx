/**
 * The Preview: the Diagram, panned and zoomed, with the Render Error over it
 * (#1016, #1017).
 *
 * A failed Render never blanks the Preview. The last good Diagram stays where
 * it was, dimmed and greyed, with the error in a banner across the top — so
 * the Diagram the user was working on remains the thing they are looking at,
 * and the failure is an annotation on it rather than a replacement for it.
 */

import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";
import { COPY } from "../copy.js";
import { formatPosition } from "../render/position.js";
import type { PresentedError } from "../render/presentation.js";
import type { Diagram } from "../render/render.js";
import type { PanZoom } from "./panzoom.js";

export interface PreviewProps {
  /** The last Diagram that rendered — kept through a failure, never cleared by one. */
  readonly diagram: Diagram | null;
  /** The Render Error, once it may be presented (#1017). */
  readonly error: PresentedError | null;
  /** Whether the Document has any Scripts at all. */
  readonly hasScripts: boolean;
  readonly panzoom: PanZoom;
  /** Runs the Command that writes a Fence — the hint's only route to it. */
  readonly onInsertDiagram: () => void;
  /**
   * The element the Diagram is drawn in, for finding the Object under a click
   * (#1029). The click itself comes through `panzoom`, which tells it from a pan.
   */
  readonly diagramRef?: RefObject<HTMLDivElement | null>;
  /**
   * The `data-pik` offset of the statement the cursor is in, whose Objects are
   * highlighted (#1029) — `null` for none, and always `null` while the Diagram
   * is older than the Script, whose offsets it no longer matches.
   */
  readonly highlight?: number | null;
}

export function Preview({
  diagram,
  error,
  hasScripts,
  panzoom,
  onInsertDiagram,
  diagramRef,
  highlight = null,
}: PreviewProps) {
  const drawn = useRef<HTMLDivElement | null>(null);
  const attachDiagram = useCallback(
    (element: HTMLDivElement | null) => {
      drawn.current = element;
      if (diagramRef) diagramRef.current = element;
    },
    [diagramRef],
  );

  // A class on the elements themselves, set after React has put the SVG in:
  // the SVG is one string, and every new one replaces every element, so the
  // highlight is re-applied whenever either changes. Never written into the
  // string, which is what Export and Copy send (#1021).
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the SVG string, which replaces every element, rather than read
  useLayoutEffect(() => {
    const element = drawn.current;
    if (!element) return;
    for (const lit of element.querySelectorAll(".is-highlighted"))
      lit.classList.remove("is-highlighted");
    if (highlight === null) return;
    for (const object of element.querySelectorAll(`[data-pik="${highlight}"]`)) {
      object.classList.add("is-highlighted");
    }
  }, [highlight, diagram?.svg]);

  // A Document with no Scripts is the one empty Preview that earns words: no
  // Diagram is coming, whatever the user types, until a Fence exists.
  if (!hasScripts) {
    return (
      <section className="preview" data-testid="preview">
        <p className="preview__hint">
          {COPY.noDiagrams}{" "}
          <button type="button" onClick={onInsertDiagram} data-testid="insert-fence">
            {COPY.insertDiagram}
          </button>
        </p>
      </section>
    );
  }

  const { viewport } = panzoom;
  return (
    <section
      className="preview"
      data-testid="preview"
      data-failed={error !== null}
      ref={panzoom.attach}
      {...panzoom.handlers}
    >
      {diagram && (
        <div
          className="preview__diagram"
          ref={attachDiagram}
          // A `role="img"` element is a leaf in the accessibility tree, so the
          // SVG inside stops being read out label by label in geometric order
          // — which sounds like content but is noise. The role and the label go
          // on this wrapper and never into the SVG string itself: #1021 exports
          // that string, and an attribute written into it would ride out into
          // every exported file and every clipboard paste (#1101).
          role="img"
          aria-label={COPY.diagramLabel}
          style={{
            width: diagram.width,
            height: diagram.height,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: pikchr output, inlined on purpose
          dangerouslySetInnerHTML={{ __html: diagram.svg }}
        />
      )}
      {error && (
        // Position, two spaces, then Pikchr's own words — verbatim: not
        // reworded, not prefixed, not sentence-cased, no full stop added
        // (#1100). The two spaces are the separator, so they are in the text
        // rather than in a `gap`: what is read out, and what a user copies out
        // of the banner, has to be the same string the spec names.
        <p className="preview__banner" data-testid="render-error">
          <strong>{formatPosition(error.position)}</strong>
          {"  "}
          <span data-testid="render-error-message">{error.message}</span>
        </p>
      )}
    </section>
  );
}
