/**
 * Drafts: the copy of an Unsaved Document's text that outlives the session
 * (#1020, decided in #1054).
 *
 * A Draft is **crash insurance, not session restore** — it lives in the
 * webview's storage (ADR 0010), which Safari's ITP clears after seven days
 * without interaction and which every browser may evict under pressure. That is
 * why the Prompt before replacing or closing a Document stays, and why nothing
 * in the UI ever promises durability.
 *
 * The word *Draft* is internal: the user reads "unsaved work" (#1100).
 */

import { JsonList, type KeyValueStore } from "../platform/storage.js";
import type { DocumentRef } from "../platform/types.js";

/** Where every Draft lives, in one record: they are read and written whole. */
const STORAGE_KEY = "pikchard.drafts";

/**
 * How many Drafts of path-less Documents are kept, oldest evicted first.
 *
 * Only the path-less ones are capped. A Draft with an Identity is bounded by
 * the files the user actually edits and can always be reached again through
 * the file itself; a path-less one exists nowhere else, and would otherwise
 * grow by one for every Untitled Document ever abandoned.
 */
export const PATHLESS_DRAFT_LIMIT = 10;

/**
 * One Document's unsaved text, as it will be found again next launch.
 *
 * `identity` is what makes the Draft restorable *as that Document* rather than
 * as loose text: with one, Restore reopens a Document that Save can write
 * back; without one, it comes back the Untitled Document it was.
 */
export interface Draft {
  /** The Identity's key where there is one, else the id generated at the Document's birth. */
  readonly key: string;
  /** The Document's Name — what the Restore list shows. */
  readonly name: string;
  /** Where the Document came from, or `null` for a path-less Draft. */
  readonly identity: DocumentRef | null;
  /** The text as the editor held it when the Draft was written. */
  readonly text: string;
  /** The Baseline it was Unsaved against, so relevance needs no file read. */
  readonly baseline: string;
  /** When it was written, for the Restore list's "2 hours ago" and for eviction. */
  readonly at: number;
}

/**
 * Every Draft, in the webview's storage.
 *
 * Keyed by Identity where there is one and otherwise by an id generated at the
 * Document's birth, so two Untitled Documents in two tabs never collide. Two
 * tabs on one Identity are last-write-wins — accepted, not defended (#1054).
 */
export class DraftStore {
  private readonly entries: JsonList<Draft>;

  constructor(
    /** `null` for a host with no storage at all; omit it for the real one. */
    storage?: KeyValueStore | null,
  ) {
    this.entries =
      storage === undefined ? new JsonList(STORAGE_KEY) : new JsonList(STORAGE_KEY, storage);
  }

  /** Newest first. */
  list(): Draft[] {
    return [...this.entries.read()].sort((a, b) => b.at - a.at);
  }

  read(key: string): Draft | undefined {
    return this.list().find((draft) => draft.key === key);
  }

  /**
   * The Drafts worth offering for Restore: the ones whose text still differs
   * from the Baseline they were taken against.
   *
   * Decided here and never by reading the file, because at launch there is no
   * file to read: a Chromium handle restored from IndexedDB is in the `prompt`
   * permission state, and `requestPermission` throws without the transient
   * user activation a launch does not have (#1054).
   */
  restorable(): Draft[] {
    return this.list().filter((draft) => draft.text !== draft.baseline);
  }

  /** This one Document's Draft, if it is worth offering — by the same rule. */
  restorableFor(key: string): Draft | undefined {
    return this.restorable().find((draft) => draft.key === key);
  }

  /** Keep this Document's Draft, replacing any the Document already had. */
  write(draft: Draft): void {
    const others = this.list().filter((entry) => entry.key !== draft.key);
    this.save(evictPathless([draft, ...others]));
  }

  discard(key: string): void {
    this.save(this.list().filter((draft) => draft.key !== key));
  }

  private save(drafts: Draft[]): void {
    this.entries.write(drafts);
  }
}

/** Keep the newest {@link PATHLESS_DRAFT_LIMIT} path-less Drafts, and every other one. */
function evictPathless(drafts: Draft[]): Draft[] {
  const pathless = drafts.filter((draft) => draft.identity === null);
  if (pathless.length <= PATHLESS_DRAFT_LIMIT) return drafts;
  const kept = new Set([...pathless].sort((a, b) => b.at - a.at).slice(0, PATHLESS_DRAFT_LIMIT));
  return drafts.filter((draft) => draft.identity !== null || kept.has(draft));
}
