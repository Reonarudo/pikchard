import { describe, expect, it } from "vitest";
import { memoryStore } from "../platform/storage.js";
import { type Draft, DraftStore, PATHLESS_DRAFT_LIMIT } from "./drafts.js";

const draft = (over: Partial<Draft> = {}): Draft => ({
  key: "/notes.md",
  name: "notes.md",
  identity: { key: "/notes.md", name: "notes.md" },
  text: "circle\n",
  baseline: "box\n",
  at: 1000,
  ...over,
});

/** A path-less Draft: an Untitled Document, keyed by an id of its own. */
const pathless = (key: string, at: number): Draft =>
  draft({ key, name: "Untitled", identity: null, at });

describe("the Draft store", () => {
  it("keeps a Draft and reads it back", () => {
    const store = new DraftStore(memoryStore());
    store.write(draft());

    expect(store.read("/notes.md")).toEqual(draft());
  });

  it("replaces the Draft for a Document rather than adding a second", () => {
    const store = new DraftStore(memoryStore());
    store.write(draft({ text: "one\n", at: 1 }));
    store.write(draft({ text: "two\n", at: 2 }));

    expect(store.list()).toEqual([draft({ text: "two\n", at: 2 })]);
  });

  it("discards a Draft", () => {
    const store = new DraftStore(memoryStore());
    store.write(draft());
    store.discard("/notes.md");

    expect(store.read("/notes.md")).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("lists Drafts newest first", () => {
    const store = new DraftStore(memoryStore());
    store.write(draft({ key: "a", at: 1 }));
    store.write(draft({ key: "c", at: 3 }));
    store.write(draft({ key: "b", at: 2 }));

    expect(store.list().map((entry) => entry.key)).toEqual(["c", "b", "a"]);
  });

  it("offers for Restore only the Drafts that differ from their Baseline", () => {
    // Relevance is Draft-vs-Baseline and never a read of the file (#1054): at
    // launch a Chromium handle cannot be read without a permission prompt, and
    // a launch has no user activation to ask with.
    const store = new DraftStore(memoryStore());
    store.write(draft({ key: "edited", text: "circle\n", baseline: "box\n" }));
    store.write(draft({ key: "untouched", text: "box\n", baseline: "box\n" }));

    expect(store.restorable().map((entry) => entry.key)).toEqual(["edited"]);
  });

  it("caps path-less Drafts, dropping the oldest first", () => {
    const store = new DraftStore(memoryStore());
    for (let index = 0; index <= PATHLESS_DRAFT_LIMIT; index += 1) {
      store.write(pathless(`untitled-${index}`, index));
    }

    const kept = store.list().map((entry) => entry.key);
    expect(kept).toHaveLength(PATHLESS_DRAFT_LIMIT);
    expect(kept).not.toContain("untitled-0");
    expect(kept).toContain(`untitled-${PATHLESS_DRAFT_LIMIT}`);
  });

  it("never evicts a Draft that has a Document to go back to", () => {
    // The cap is on the path-less ones: those can only ever be read out of
    // this store, so they are the ones that would grow without bound.
    const store = new DraftStore(memoryStore());
    for (let index = 0; index <= PATHLESS_DRAFT_LIMIT; index += 1) {
      store.write(draft({ key: `/file-${index}.md`, at: index }));
    }

    expect(store.list()).toHaveLength(PATHLESS_DRAFT_LIMIT + 1);
  });

  it("counts a path-less Draft as old by when it was last written", () => {
    const store = new DraftStore(memoryStore());
    store.write(pathless("old", 1));
    store.write(pathless("young", 2));
    // Written again, so it is now the newer of the two.
    store.write(pathless("old", 3));
    for (let index = 0; index < PATHLESS_DRAFT_LIMIT - 1; index += 1) {
      store.write(pathless(`filler-${index}`, 10 + index));
    }

    const kept = store.list().map((entry) => entry.key);
    expect(kept).toContain("old");
    expect(kept).not.toContain("young");
  });

  it("reads corrupt storage as no Drafts at all", () => {
    const storage = memoryStore();
    storage.setItem("pikchard.drafts", "{not json");

    expect(new DraftStore(storage).list()).toEqual([]);
  });

  it("survives a host with no storage at all", () => {
    const store = new DraftStore(null);
    store.write(draft());

    expect(store.list()).toEqual([]);
  });

  it("reads nothing from a storage that throws when read", () => {
    // What the e2e run caught: Firefox with storage blocked throws from
    // `getItem`, not only from `setItem`.
    const store = new DraftStore({
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {},
    });

    expect(store.list()).toEqual([]);
    expect(store.restorable()).toEqual([]);
  });

  it("survives a storage that refuses to be written to", () => {
    // A full or disabled store costs the Draft, never the session.
    const store = new DraftStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });

    expect(() => store.write(draft())).not.toThrow();
  });
});
