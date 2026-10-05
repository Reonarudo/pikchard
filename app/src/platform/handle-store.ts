import { type DocumentRef, RECENT_LIMIT } from "./types.js";

/**
 * Where the Browser keeps the Identities it can reach again.
 *
 * A `FileSystemFileHandle` is structured-cloneable but not serialisable to
 * JSON, so Recent cannot ride in `localStorage` with the rest of the app state
 * — IndexedDB is the only store that will hold one. This interface exists so
 * that policy (order, cap, pruning) can be tested without one.
 */
export interface HandleStore {
  /** Record an Identity, or move it to the front if it is already known. */
  put(ref: DocumentRef, handle: FileSystemFileHandle): Promise<void>;
  get(key: string): Promise<FileSystemFileHandle | undefined>;
  /** Most-recently-touched first, at most {@link RECENT_LIMIT}. */
  list(): Promise<DocumentRef[]>;
  remove(key: string): Promise<void>;
}

interface Entry {
  ref: DocumentRef;
  handle: FileSystemFileHandle;
  touchedAt: number;
}

/**
 * The order-and-cap policy, over whatever map it is given. Both the IndexedDB
 * store and the test store are this class with a different map behind them.
 */
abstract class EntryStore implements HandleStore {
  protected abstract load(): Promise<Map<string, Entry>>;
  protected abstract save(entries: Map<string, Entry>): Promise<void>;

  async put(ref: DocumentRef, handle: FileSystemFileHandle): Promise<void> {
    const entries = await this.load();
    entries.set(ref.key, { ref, handle, touchedAt: this.now() });
    // Evict by age, so a cap of ten never drops something newer than what stays.
    const ordered = [...entries.entries()].sort((a, b) => b[1].touchedAt - a[1].touchedAt);
    await this.save(new Map(ordered.slice(0, RECENT_LIMIT)));
  }

  async get(key: string): Promise<FileSystemFileHandle | undefined> {
    return (await this.load()).get(key)?.handle;
  }

  async list(): Promise<DocumentRef[]> {
    const entries = await this.load();
    return [...entries.values()]
      .sort((a, b) => b.touchedAt - a.touchedAt)
      .slice(0, RECENT_LIMIT)
      .map((entry) => entry.ref);
  }

  async remove(key: string): Promise<void> {
    const entries = await this.load();
    entries.delete(key);
    await this.save(entries);
  }

  /**
   * Monotonic even when two Documents are opened inside one millisecond, which
   * `Date.now()` alone is not — and which the "reopening moves an entry" rule
   * depends on.
   */
  private lastStamp = 0;
  private now(): number {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
    return this.lastStamp;
  }
}

/** The store the tests run against; holds its entries for the life of the object. */
export class MemoryHandleStore extends EntryStore {
  private entries = new Map<string, Entry>();

  protected async load(): Promise<Map<string, Entry>> {
    return new Map(this.entries);
  }

  protected async save(entries: Map<string, Entry>): Promise<void> {
    this.entries = entries;
  }
}

const DB_NAME = "pikchard-recent";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const RECORD_KEY = "entries";

/**
 * The real store. Keeps every entry under one IndexedDB record: Recent is ten
 * items read and written whole, so a record per Document would buy nothing and
 * cost a cursor.
 */
export class IndexedDbHandleStore extends EntryStore {
  private database?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  protected async load(): Promise<Map<string, Entry>> {
    const records = await this.transact<Entry[] | undefined>("readonly", (store) =>
      store.get(RECORD_KEY),
    );
    return new Map((records ?? []).map((entry) => [entry.ref.key, entry]));
  }

  protected async save(entries: Map<string, Entry>): Promise<void> {
    await this.transact("readwrite", (store) => store.put([...entries.values()], RECORD_KEY));
  }
}
