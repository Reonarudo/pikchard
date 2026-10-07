/**
 * Opening a Document from Recent (#1020's half of #1018).
 *
 * The whole of this module is the distinction #1054 insisted on: a Recent entry
 * is pruned when the file **can no longer be read**, and not when the user
 * simply declined to let Pikchard read it. A denial is a decision, and the
 * entry is still good — so the Toast for it says nothing about the list, while
 * the Toast for a missing file says the entry is gone, because the user is
 * about to watch the menu change under them (#1100).
 *
 * Entries are never validated eagerly: an entry is checked only by being
 * clicked. On Chromium that is not even possible — reading a restored handle
 * needs a permission prompt, which needs the transient activation a launch
 * does not have — and skipping it keeps both Platforms identical.
 */

import {
  type DocumentRef,
  DocumentUnreadableError,
  type OpenedDocument,
  type Platform,
} from "../platform/types.js";

/**
 * What came of clicking a Recent entry.
 *
 * The two failures carry the Name rather than the ref, because the Name is all
 * the Toast says — and the pruning has already happened inside the Platform,
 * which is the only thing that knows how to reach its own list.
 */
export type RecentOpenResult =
  | { outcome: "opened"; opened: OpenedDocument }
  | { outcome: "denied"; name: string }
  | { outcome: "missing"; name: string };

/**
 * Read a Recent entry back into a Document, and prune it if it has gone.
 *
 * This is where the pruning rule lives, because this is the only place it
 * applies: reading is not pruning — a Save reads the file too, to see whether it
 * changed underneath, and that must never quietly shorten the list.
 *
 * Anything that is not one of the two known failures is left to the caller: an
 * unexpected error is not evidence the file has gone, so reporting it as a
 * missing file would tell the user the list changed when it did not.
 */
export async function openFromRecent(
  platform: Platform,
  ref: DocumentRef,
): Promise<RecentOpenResult> {
  try {
    const text = await platform.readDocument(ref);
    return { outcome: "opened", opened: { name: ref.name, text, identity: ref } };
  } catch (error) {
    if (error instanceof DocumentUnreadableError) {
      // A denial is not staleness: the file is fine, and the entry stays.
      if (error.reason === "missing") await platform.forgetRecent(ref.key);
      return { outcome: error.reason, name: ref.name };
    }
    throw error;
  }
}
