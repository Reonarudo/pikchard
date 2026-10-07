import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../platform/storage.js";
import { DRAFT_DEBOUNCE_MS, DraftWriter } from "./autosave.js";
import { type Draft, DraftStore } from "./drafts.js";

/** A writer over a live store, with the snapshot the test can move. */
function writerOver(
  snapshot: { text: string; baseline: string } | null,
  onWrite: () => void = () => {},
) {
  const store = new DraftStore(memoryStore());
  const current = { value: snapshot };
  const writer = new DraftWriter(
    store,
    () =>
      current.value === null
        ? null
        : {
            key: "/notes.md",
            name: "notes.md",
            identity: { key: "/notes.md", name: "notes.md" },
            ...current.value,
          },
    onWrite,
  );
  return { store, writer, current };
}

const texts = (drafts: Draft[]) => drafts.map((draft) => draft.text);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the Draft write cadence", () => {
  it("writes nothing while the user is still typing", () => {
    const { store, writer, current } = writerOver({ text: "c", baseline: "box\n" });

    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 1);
    current.value = { text: "ci", baseline: "box\n" };
    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 1);

    expect(store.list()).toEqual([]);
  });

  it("writes once the text has been quiet", () => {
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });

    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(texts(store.list())).toEqual(["circle\n"]);
    expect(store.read("/notes.md")?.at).toBe(Date.now());
  });

  it("writes what the text is when the timer fires, not when it was scheduled", () => {
    const { store, writer, current } = writerOver({ text: "c", baseline: "box\n" });

    writer.noteEdit();
    current.value = { text: "circle\n", baseline: "box\n" };
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(texts(store.list())).toEqual(["circle\n"]);
  });

  it("writes at once when the window loses focus", () => {
    // The flush that covers macOS Cmd+Q, which gives no other warning (#1054).
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });

    writer.noteEdit();
    writer.flush();

    expect(texts(store.list())).toEqual(["circle\n"]);
  });

  it("does not write twice when a flush is followed by the timer", () => {
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });

    writer.noteEdit();
    writer.flush();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(store.list()).toHaveLength(1);
  });

  it("flushes nothing when there was nothing to flush", () => {
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });

    writer.flush();

    expect(store.list()).toEqual([]);
  });

  it("deletes the Draft when the text is edited back to the Baseline", () => {
    // Deleted rather than rewritten: a Document that matches its Baseline is
    // not Unsaved, and has nothing to restore (#1054).
    const { store, writer, current } = writerOver({ text: "circle\n", baseline: "box\n" });
    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    current.value = { text: "box\n", baseline: "box\n" };
    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(store.list()).toEqual([]);
  });

  it("drops the Draft of a Document that has been saved", () => {
    // A saved Document never has a Draft — and a pending write must not
    // resurrect the one that was just deleted.
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });
    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    writer.noteEdit();
    writer.discard();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(store.list()).toEqual([]);
  });

  it("writes nothing when there is no Document to write about", () => {
    const { store, writer } = writerOver(null);

    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    writer.flush();

    expect(store.list()).toEqual([]);
  });

  it("stops writing once disposed", () => {
    const { store, writer } = writerOver({ text: "circle\n", baseline: "box\n" });

    writer.noteEdit();
    writer.dispose();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(store.list()).toEqual([]);
  });

  it("says when it has kept unsaved work, which is when the iOS hint is due", () => {
    // The moment the user first has something to lose (#1025).
    let writes = 0;
    const { writer } = writerOver({ text: "circle\n", baseline: "box\n" }, () => writes++);

    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(writes).toBe(1);
  });

  it("says nothing when the Draft went rather than being kept", () => {
    let writes = 0;
    const { writer } = writerOver({ text: "box\n", baseline: "box\n" }, () => writes++);

    writer.noteEdit();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);

    expect(writes).toBe(0);
  });
});
