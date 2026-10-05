import { JsonList, type KeyValueStore, memoryStore, webStorage } from "./storage.js";
import { type DocumentRef, RECENT_LIMIT } from "./types.js";

/**
 * Recent, for a Platform whose Identities are plain values.
 *
 * Desktop Identities are paths, so unlike the Browser's handles they survive a
 * round trip through `localStorage` — which is where ADR 0010 puts Recent on
 * both Platforms.
 */
export class RecentList {
  private readonly entries: JsonList<DocumentRef>;

  constructor(
    key: string,
    /** `null` for a host with no storage at all; omit it for the real one. */
    storage: KeyValueStore | null = webStorage(),
  ) {
    this.entries = new JsonList(key, storage);
  }

  list(): DocumentRef[] {
    // Capped on the way out as well as on the way in: a record written by an
    // older Pikchard, or by hand, is not allowed to make the menu longer.
    return this.entries.read().slice(0, RECENT_LIMIT);
  }

  /** Newest first, one entry per Identity — reopening moves rather than adds. */
  remember(ref: DocumentRef): void {
    const next = [ref, ...this.list().filter((entry) => entry.key !== ref.key)];
    this.save(next.slice(0, RECENT_LIMIT));
  }

  forget(key: string): void {
    this.save(this.list().filter((entry) => entry.key !== key));
  }

  private save(entries: DocumentRef[]): void {
    this.entries.write(entries);
  }
}

/**
 * The same order-and-cap rules over a store that lives and dies with the
 * object — so `FakePlatform` gets Recent's real behaviour rather than a second
 * copy of it that could drift.
 */
export class MemoryRecentList extends RecentList {
  constructor() {
    super("recent", memoryStore());
  }
}
