/**
 * The webview's own storage, which is where everything that is not a Document
 * lives on both Platforms — Recent, the Drafts, the theme, the split ratio
 * (ADR 0010).
 *
 * Everything here is about one hazard: this storage is allowed to fail. Reading
 * the `localStorage` property *throws* in Firefox when storage is blocked for
 * the origin, `getItem` can throw on a blocked or partitioned store even once
 * the object is in hand, `setItem` throws on a full one, and what comes back
 * may be something another version of Pikchard wrote. None of that may reach the
 * user: the cost of a broken store is the convenience it held, never the
 * session, and never a crash on launch.
 */

/** The slice of `Storage` any of this actually needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The webview's storage, guarded at every step — or `null` if it cannot be used.
 *
 * `sessionStorage` is for the one thing that must survive a reload and nothing
 * longer: the update reload's note to itself (#1025).
 */
export function webStorage(
  area: "localStorage" | "sessionStorage" = "localStorage",
): KeyValueStore | null {
  let storage: Storage | undefined;
  try {
    storage = globalThis[area];
  } catch {
    return null;
  }
  if (!storage) return null;
  const usable = storage;
  return {
    getItem: (key) => {
      try {
        return usable.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        usable.setItem(key, value);
      } catch {
        // A full or blocked store costs what was being kept, not the session.
      }
    },
  };
}

/**
 * A list kept as one JSON record: read whole, written whole.
 *
 * Both lists Pikchard keeps are short — Recent is ten entries and the Drafts are
 * of the Documents one person has open — so a record each would buy nothing and
 * cost a second failure mode. Anything that is not a readable array reads as an
 * empty list, which is the same answer as "nothing kept yet" and the only answer
 * that cannot break a launch.
 */
export class JsonList<T> {
  constructor(
    private readonly key: string,
    /** `null` for a host with no storage at all; omit it for the real one. */
    private readonly storage: KeyValueStore | null = webStorage(),
  ) {}

  read(): T[] {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  write(values: T[]): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(values));
    } catch {
      // As above: the list is a convenience, and losing it is survivable.
    }
  }
}

/** A list that lives and dies with the object, for the fakes and the tests. */
export function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}
