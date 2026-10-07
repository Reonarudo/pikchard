/**
 * The desktop's own check for a newer release, once a day (#1035).
 *
 * The web build needs none of this: its service worker looks on every load.
 * The desktop asks GitHub at most once a day, a little after launch, and says
 * nothing unless it finds something — offline, rate-limited and "up to date"
 * are all silence. A release is offered once: after that it is the user's to
 * take from Help ▸ Check for Updates…, which always answers.
 *
 * Kept in the webview's storage, like everything else Pikchard remembers
 * (ADR 0010). No storage, no check: asking GitHub on every launch because the
 * date could not be written down would be the one thing worse than not asking.
 */

import type { KeyValueStore } from "../platform/storage.js";
import type { UpdateCheck, UpdateChecker } from "./releases.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

const CHECKED_KEY = "pikchard.updates.checkedAt";
const SHOWN_KEY = "pikchard.updates.shown";

export class DailyUpdateCheck {
  constructor(
    private readonly checker: UpdateChecker,
    private readonly offer: (found: Extract<UpdateCheck, { kind: "available" }>) => void,
    private readonly storage: KeyValueStore | null,
    private readonly now: () => number = Date.now,
  ) {}

  /** Check, if a day has passed since the last answer. */
  async run(): Promise<void> {
    if (this.storage === null) return;
    const last = Number(this.storage.getItem(CHECKED_KEY) ?? 0);
    if (this.now() - last < DAY_MS) return;

    const found = await this.checker.check();
    // No answer is not an answer: offline today should not cost tomorrow's check.
    if (found.kind === "failed") return;
    this.storage.setItem(CHECKED_KEY, String(this.now()));

    if (found.kind !== "available" || this.storage.getItem(SHOWN_KEY) === found.version) return;
    this.shown(found.version);
    this.offer(found);
  }

  /** A release the user has been shown — by this check, or by asking. */
  shown(version: string): void {
    this.storage?.setItem(SHOWN_KEY, version);
  }
}
