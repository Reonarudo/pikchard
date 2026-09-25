/**
 * When a failure is allowed to be *seen* (#1017).
 *
 * The store is always current — a Render runs on every change and the error
 * slot is written with no delay. But most intermediate states of a half-typed
 * statement fail to parse, so showing every one of them makes the app strobe:
 * dim on, banner in, banner out, undim, per keystroke. So one timer sits
 * between the store and every surface that presents a failure — the Preview's
 * dimming, the banner, the CodeMirror diagnostic and the status bar entry.
 *
 * One timer over all four, deliberately: splitting it would only move the
 * strobe from the Preview into the gutter, where the underline sits under the
 * user's own cursor.
 */

import type { RenderError } from "@pikchard/pikchr-wasm";
import { useEffect, useRef, useState } from "react";
import type { Position } from "./position.js";

/** How long the text must be quiet before a failure is shown. */
export const ERROR_QUIET_MS = 300;

/**
 * A Render Error as the surfaces present it: Pikchr's own words, and where in
 * the Document they apply. The two always travel together — a message with no
 * position is not something either the banner or the status bar can show.
 */
export interface PresentedError {
  readonly message: string;
  readonly position: Position;
}

/**
 * The Render Error as the app is allowed to present it — `null` while the
 * failure is still being typed.
 *
 * A failure that did not arrive from typing is shown at once: switching to an
 * already-broken Script, or opening one, is a deliberate change of context,
 * and the user should see where they landed. The delay exists to absorb
 * typing and nothing else.
 *
 * Success is never delayed in either direction: a Render that succeeds inside
 * the window cancels the timer, so nothing is ever shown for an error the user
 * has already typed past.
 */
export function usePresentedError(
  error: RenderError | null,
  text: string,
  activeIndex: number | null,
): RenderError | null {
  const [presented, setPresented] = useState<RenderError | null>(null);
  const previous = useRef<{ text: string; activeIndex: number | null } | null>(null);

  useEffect(() => {
    const last = previous.current;
    previous.current = { text, activeIndex };

    if (error === null) {
      setPresented(null);
      return;
    }
    const typed = last !== null && last.activeIndex === activeIndex && last.text !== text;
    if (!typed) {
      setPresented(error);
      return;
    }
    const timer = setTimeout(() => setPresented(error), ERROR_QUIET_MS);
    return () => clearTimeout(timer);
  }, [error, text, activeIndex]);

  return presented;
}
