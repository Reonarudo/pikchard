/**
 * A thing that opens, and the two ways every user closes it: a click elsewhere,
 * and Escape.
 *
 * Shared by every menu in the bar and by the Script selector, which is #1101
 * guard 2 — the data-driven menus are keyboard-operable by construction rather
 * than as a separate feature. The *closing* is the part with rules in it — Escape must
 * hand focus back to the cell it came from, or the next Tab starts from the top
 * of the document, which is focus the app took and did not give back (README's
 * keyboard baseline). A click elsewhere is going somewhere else, and there focus
 * is left to follow the pointer rather than being pulled back.
 */

import { type RefObject, useCallback, useEffect, useState } from "react";

export interface Disclosure {
  readonly open: boolean;
  /** Flip it — what the trigger does. */
  readonly toggle: () => void;
  /** Shut it and take focus back to the trigger: Escape, and choosing an item. */
  readonly close: () => void;
}

/**
 * @param container everything that counts as "inside" — a click in here does not close it
 * @param trigger what focus goes back to
 */
export function useDisclosure(
  container: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
): Disclosure {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, [trigger]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.document.addEventListener("mousedown", onPointerDown);
    window.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.document.removeEventListener("mousedown", onPointerDown);
      window.document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, container]);

  const toggle = useCallback(() => setOpen((was) => !was), []);
  return { open, toggle, close };
}
