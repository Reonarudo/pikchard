/**
 * The Toasts: transient notices that appear briefly, ask nothing and disappear
 * on their own (`CONTEXT.md`).
 *
 * They **stack**, bottom-right above the status bar, for about two and a half
 * seconds each (#1047). A stack rather than a single slot because a new notice
 * must not replace one the user has not read yet: a multi-file open and a failed
 * save a second later are two things to know, not one.
 *
 * The stack is the app's **one live region** (#1101 guard 10), polite, and
 * present even when empty — a region that appears together with its first
 * message is often not announced at all. Each notice inside it is plain text, so
 * two Toasts are two announcements from one region rather than two regions.
 *
 * A Toast that carries an action must not auto-dismiss (#1101 guard 11): an
 * interactive control inside a 2.5 s dwell is out of reach of the keyboard. The
 * update Toast is the one that does (#1025), and it stays until it is answered.
 */

import { useEffect, useRef } from "react";
import type { ToastNotice } from "../store.js";

/**
 * How long a notice stays: long enough to read a filename in, and short enough
 * that copy is what gets cut to fit it, not the other way round (#1047, #1100).
 */
export const TOAST_MS = 2500;

/**
 * How long a notice that `lingers` stays: the iOS Home Screen hint, which breaks
 * the eight-word ceiling deliberately because it must name both the gesture and
 * the reason (#1025, #1100), and is given the time those words take.
 */
export const LONG_TOAST_MS = 6000;

export interface ToastsProps {
  /** Oldest first, as the store keeps them — the newest sits nearest the bar. */
  readonly notices: readonly ToastNotice[];
  readonly onDismiss: (id: number) => void;
}

export function Toasts({ notices, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * One notice, on its own clock. Keyed by id, so a second notice neither resets
 * the first's timer nor inherits it — and the same words twice over are two
 * notices, each with its full time on screen.
 */
function Toast({ notice, onDismiss }: { notice: ToastNotice; onDismiss: (id: number) => void }) {
  // Through a ref, so the clock depends on the notice alone: a parent that hands
  // over a fresh callback on each render must not restart every Toast's timer.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const { action } = notice;
  const dwell = action ? null : notice.lingers ? LONG_TOAST_MS : TOAST_MS;

  useEffect(() => {
    if (dwell === null) return;
    const timer = setTimeout(() => dismiss.current(notice.id), dwell);
    return () => clearTimeout(timer);
  }, [notice.id, dwell]);

  return (
    <div className="toast" data-testid="toast">
      {notice.message}
      {action && (
        <button
          type="button"
          className="toast__action"
          data-testid="toast-action"
          onClick={() => {
            dismiss.current(notice.id);
            action.run();
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
