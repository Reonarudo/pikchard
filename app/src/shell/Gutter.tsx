/**
 * The 6 px bar between the editor and the Preview (#1023, #1047).
 *
 * Drag it to resize, double-click it to reset. It is deliberately **not a tab
 * stop** (#1101 guard 12): dragging is a pointer gesture with no keyboard
 * equivalent worth inventing, and the keyboard route to seeing the Diagram
 * full-width is Mod+B — a Command with a menu item and a toolbar button.
 * `role="separator"` is what it says to anything that asks what it is.
 *
 * biome-ignore-all lint/a11y/useSemanticElements: an `<hr>` cannot carry the drag
 * handlers, and the role is the whole of what this element claims.
 *
 * Pointer capture rather than window listeners: the drag must follow the pointer
 * out over the Preview and back, and `setPointerCapture` is what keeps the events
 * coming to this element while it does.
 */

import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";

export interface GutterProps {
  /** The pointer's x, and the width available to both panes. */
  readonly onDrag: (x: number, available: number) => void;
  readonly onReset: () => void;
}

export function Gutter({ onDrag, onReset }: GutterProps) {
  const dragging = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    // The split's own left edge is the origin: the editor's width is the pointer
    // minus wherever the pane starts, which is not always zero.
    const pane = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!pane) return;
    onDrag(event.clientX - pane.left, pane.width);
  };

  const stop = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="gutter"
      data-testid="gutter"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
    />
  );
}
