/**
 * The reload the user asked for, remembered across it (#1025).
 *
 * Taking a new version reloads the page, and a cold launch with unsaved work
 * would then ask about it in the Restore list. That is a narrow, marked
 * exception to #1054's rule that Restore is a list shown on a cold launch: the
 * user asked for this reload, so re-asking them about their own work would be
 * the app failing to remember what it was just told. So before reloading, the
 * app notes which Document it was on, and on the way back up it restores that
 * Document's Draft silently.
 *
 * Kept in the tab's `sessionStorage` (the session passes it in), because the
 * note is for this tab and this reload only.
 */

import type { KeyValueStore } from "../platform/storage.js";

const STORAGE_KEY = "pikchard.updateReload";

/** Note that the next launch in this tab is the update reload, and on which Draft. */
export function markUpdateReload(draftKey: string, storage: KeyValueStore | null): void {
  storage?.setItem(STORAGE_KEY, draftKey);
}

/**
 * The Draft key an update reload left behind, or `null` for any other launch.
 * Consumed as it is read, so only the reload itself ever sees it.
 */
export function takeUpdateReload(storage: KeyValueStore | null): string | null {
  const key = storage?.getItem(STORAGE_KEY) ?? null;
  if (!key) return null;
  storage?.setItem(STORAGE_KEY, "");
  return key;
}
