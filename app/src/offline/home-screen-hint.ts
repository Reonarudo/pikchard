/**
 * The iOS Home Screen hint (#1025, worded in #1100).
 *
 * On iOS, only a Home Screen install exempts the Drafts and the precache from
 * ITP's seven-day deletion of script-writable storage. So Safari on iOS users
 * have something real to gain from installing, and no other way to learn it.
 *
 * The hint is a Toast, shown **the first time a Draft is written** — the moment
 * the user first has something to lose. Not on arrival, not on a timer and not
 * on a visit count: at the moment it appears it describes a risk just created,
 * which is what keeps it from being the install nag #1056 rejected. There is
 * still no Install Command, menu item or banner.
 */

import { type KeyValueStore, webStorage } from "../platform/storage.js";

/**
 * Remembered beside the Drafts, in the same storage. That flag is itself subject
 * to ITP's deletion, so the hint can return once the seven days elapse — which
 * is correct, since it returns exactly when its warning has come true. Do not
 * move it somewhere more durable.
 */
const STORAGE_KEY = "pikchard.homeScreenHint";

/** The slice of `navigator` the question needs. */
export interface BrowserIdentity {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  /** Safari's own, and `true` only when launched from the Home Screen. */
  readonly standalone?: boolean;
}

/**
 * Safari on an iPhone or iPad, in a tab rather than from the Home Screen.
 *
 * Sniffed from the user agent, which is the only signal there is: iPadOS asks
 * for the desktop site by default and so says it is a Mac, which the touch
 * points give away. The other iOS browsers carry their own token beside
 * `Safari/`, and an app's in-app browser carries no `Safari/` at all.
 */
export function isIosSafari(browser: BrowserIdentity): boolean {
  const { userAgent } = browser;
  if (browser.standalone === true) return false;
  const iPhone = /\b(iPhone|iPod|iPad)\b/.test(userAgent);
  const iPadAsMac = /\bMacintosh\b/.test(userAgent) && browser.maxTouchPoints > 1;
  if (!iPhone && !iPadAsMac) return false;
  if (!/\bSafari\//.test(userAgent)) return false;
  return !/\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|GSA|DuckDuckGo|YaBrowser)\//.test(userAgent);
}

export class HomeScreenHint {
  /** Shown in this session, whatever the storage managed to remember. */
  private shown = false;

  constructor(
    /** Whether this is a browser the hint is for at all. */
    private readonly eligible: boolean,
    /** `null` for a host with no storage at all; omit it for the real one. */
    private readonly storage: KeyValueStore | null = webStorage(),
  ) {}

  /**
   * Unsaved work was just kept: is the hint due? `true` at most once, and
   * remembered as shown the moment it says so.
   */
  take(): boolean {
    if (!this.eligible || this.shown) return false;
    if (this.storage && this.storage.getItem(STORAGE_KEY) !== null) return false;
    this.shown = true;
    this.storage?.setItem(STORAGE_KEY, "shown");
    return true;
  }
}
