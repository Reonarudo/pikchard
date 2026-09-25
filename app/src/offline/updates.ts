/**
 * A new version of Pikchard, waiting (#1025).
 *
 * The service worker is registered in **prompt** mode: a new version installs
 * in the background and then *waits*, and the user is told and chooses when to
 * take it. Nothing reloads unasked — an editor is the worst app to yank out
 * from under someone mid-keystroke. If the user never answers, the waiting
 * worker activates on the next cold start, and nothing is forced.
 *
 * `virtual:pwa-register` is injected rather than imported here, so this reads
 * as the policy and the tests can drive it; `App.tsx` is where the real one is
 * handed over, and the desktop build resolves it to a stub (`vite.config.ts`).
 */

import type { RegisterSWOptions } from "vite-plugin-pwa/types";
import type { Unsubscribe } from "../platform/types.js";

export type { RegisterSWOptions };

/** The shape of `registerSW` from `virtual:pwa-register`. */
export type RegisterSW = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

/** Take the waiting version: the page reloads onto it. */
export type ApplyUpdate = () => Promise<void>;

export interface UpdateWatch {
  /**
   * Be told, once, that a new version is waiting — including when it was
   * already waiting before this listener arrived.
   */
  onReady(listener: (apply: ApplyUpdate) => void): Unsubscribe;
}

/**
 * Register the service worker and watch it for a waiting version.
 *
 * Called once, at startup. The listener is separate from the registration
 * because the registration belongs to the page and the listener to React,
 * which subscribes in an effect and — under StrictMode — twice.
 */
export function watchForUpdates(
  register: RegisterSW,
  reload: () => void = () => globalThis.location.reload(),
): UpdateWatch {
  let listener: ((apply: ApplyUpdate) => void) | null = null;
  let waiting = false;
  let announced = false;
  /** This tab asked for the new version. */
  let accepted = false;
  /** The new version already controls this page — some tab took it. */
  let controlling = false;

  const apply: ApplyUpdate = async () => {
    accepted = true;
    // Another tab took the update first: the worker is no longer waiting, so
    // skipping waiting would never produce the `controlling` event this tab
    // would otherwise reload on.
    if (controlling) {
      reload();
      return;
    }
    await skipWaiting();
  };

  const announce = () => {
    if (!waiting || announced || listener === null) return;
    announced = true;
    listener(apply);
  };

  const skipWaiting = register({
    // Deliberately not the plugin's React default of `true`: Workbox then
    // registers on `load`, so the precache download never competes with the
    // first load's own WASM and chunks.
    immediate: false,
    onNeedRefresh() {
      // Each waiting version is announced once — including one that arrives
      // after an earlier announcement went unanswered.
      waiting = true;
      announced = false;
      announce();
    },
    // Replaces the plugin's own `window.location.reload()`, which would fire in
    // *every* tab that was told about the update the moment any one of them
    // took it. Only the tab that asked reloads; the others keep the Toast and
    // reload when their user answers it.
    onNeedReload() {
      controlling = true;
      if (accepted) reload();
    },
    // `onOfflineReady` is left unset on purpose: it fires on the very first
    // install, and the user has no decision to make about that (#1025).
  });

  return {
    onReady(next) {
      listener = next;
      announce();
      return () => {
        if (listener === next) listener = null;
      };
    },
  };
}
