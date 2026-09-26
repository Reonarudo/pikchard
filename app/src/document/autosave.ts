/**
 * When the Draft is written (#1054's write cadence).
 *
 * Debounced after the last keystroke and never per keystroke — the Document
 * can be a large Markdown file and the store is synchronous — plus an immediate
 * flush whenever the app loses focus, which is the only warning macOS Cmd+Q
 * gives. The Unsaved dot deliberately reports none of this: it is a function of
 * Unsaved alone, so there is no "saving…" state to leak out of here (#1054).
 */

import type { Draft, DraftStore } from "./drafts.js";

/** How long the text must be quiet before the Draft is written. */
export const DRAFT_DEBOUNCE_MS = 1000;

/** The Document as it stands, when the writer comes to ask. */
export type DraftSnapshot = Omit<Draft, "at">;

/**
 * Keeps the Draft of whatever Document the snapshot describes.
 *
 * The snapshot is pulled rather than pushed, so the text crosses out of the
 * editor once per write instead of once per keystroke — `EditorState` stays the
 * single source of truth for it, and a Document nobody is editing costs
 * nothing.
 */
export class DraftWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: DraftStore,
    private readonly snapshot: () => DraftSnapshot | null,
    /**
     * Unsaved work was just kept — the moment the user first has something to
     * lose, which is when the iOS Home Screen hint is due (#1025).
     */
    private readonly onWrite: () => void = () => {},
    private readonly delay = DRAFT_DEBOUNCE_MS,
  ) {}

  /** The Document changed: write the Draft once the typing stops. */
  noteEdit(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.commit();
    }, this.delay);
  }

  /** Write now, if anything is owed. Focus loss and close-requested call this. */
  flush(): void {
    if (this.timer === null) return;
    this.cancel();
    this.commit();
  }

  /**
   * The Document was saved, or its Draft restored: drop it.
   *
   * Cancelling first is the point — a write scheduled a moment before the Save
   * would otherwise land after it and give a saved Document a Draft.
   */
  discard(): void {
    this.cancel();
    const snapshot = this.snapshot();
    if (snapshot) this.store.discard(snapshot.key);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private commit(): void {
    const snapshot = this.snapshot();
    if (snapshot === null) return;
    // Back at the Baseline is not Unsaved, so there is nothing to restore —
    // the Draft goes, rather than being rewritten as a copy of the file.
    if (snapshot.text === snapshot.baseline) {
      this.store.discard(snapshot.key);
      return;
    }
    this.store.write({ ...snapshot, at: Date.now() });
    this.onWrite();
  }
}
