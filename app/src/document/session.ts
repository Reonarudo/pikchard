/**
 * The Document's life while Pikchard is open (#1020).
 *
 * Save, Save As, Recent, the Draft, the Prompts and what the window is called
 * are one subject and not six: every one of them turns on the same three facts —
 * whether the text differs from the **Baseline**, whether the Document has an
 * **Identity**, and whether the Platform can write back to it. So they live
 * together here, and the App renders what this decides.
 *
 * The text itself stays in the editor. This module pulls it — on a Save, on a
 * Draft write, and to answer "is it Unsaved" — and never keeps a copy, which is
 * what ADR 0008 and the store's own comment require.
 */

import type { EditorState } from "@codemirror/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "../copy.js";
import { documentText } from "../editor/fidelity.js";
import type { Example } from "../examples/examples.js";
import { markUpdateReload, takeUpdateReload } from "../offline/update-reload.js";
import { type KeyValueStore, webStorage } from "../platform/storage.js";
import type { DocumentRef, OpenDelivery, OpenedDocument, Platform } from "../platform/types.js";
import { windowTitle } from "../shell/DocumentTitle.js";
import { type PromptHost, usePrompt } from "../shell/Prompt.js";
import {
  CANCEL,
  DONT_SAVE,
  OVERWRITE,
  overwritePrompt,
  saveChangesPrompt,
} from "../shell/prompts.js";
import { isUntitled, UNTITLED, useStore } from "../store.js";
import { type DraftSnapshot, DraftWriter } from "./autosave.js";
import { type Draft, DraftStore } from "./drafts.js";
import { openFromRecent } from "./open.js";
import { type SaveResult, type SaveTarget, saveDocument, saveDocumentAs } from "./save.js";

export interface DocumentSessionOptions {
  /** The Platform, chosen once at startup (ADR 0001). */
  readonly platform: Promise<Platform>;
  /** The editor's state, or `null` before it has mounted. */
  readonly editorState: () => EditorState | null;
  /** Injected by the tests; the real one is the webview's own storage (ADR 0010). */
  readonly drafts?: DraftStore;
  /**
   * Where the update reload leaves its note to itself (#1025). Injected by the
   * tests; the real one is the tab's `sessionStorage`.
   */
  readonly reloadNotes?: KeyValueStore | null;
  /** Unsaved work was just kept — the iOS Home Screen hint's moment (#1025). */
  readonly onDraftWritten?: () => void;
}

export interface DocumentSession {
  /** The Prompt on screen, and the way to ask one. */
  readonly prompt: PromptHost;
  /**
   * Whether this Platform keeps Recent at all. False on Firefox and Safari,
   * where Recent is *absent* rather than empty (#1054) — and false until the
   * Platform has resolved, which is a tick and never shows a wrong menu.
   */
  readonly showsRecent: boolean;
  /** The unsaved work this launch is offering to restore, newest first. */
  readonly restorable: readonly Draft[];
  /** Both report what became of the write; the UI ignores it, Prompt A does not. */
  readonly save: () => Promise<SaveResult | null>;
  readonly saveAs: () => Promise<SaveResult | null>;
  /** Open: the Platform's dialog, behind Prompt A (#1018). */
  readonly open: () => Promise<void>;
  readonly openRecent: (ref: DocumentRef) => Promise<void>;
  /** New: the seed Script, as an Untitled Document (#1044). */
  readonly newDocument: () => Promise<void>;
  /** An Example, which replaces the Document as an Untitled one (#1044). */
  readonly openExample: (example: Example) => Promise<void>;
  /**
   * **Prompt A**: ask, if there is anything to lose, before something replaces
   * or closes the Document. `true` to go ahead.
   *
   * Exposed because #1054 puts it on *every* such transition — "Open, drop,
   * Example, New, close" — and only drop, a Recent entry and close exist yet.
   * Open (#1018), New and Example (#1044) must each come through here.
   */
  readonly confirmReplace: () => Promise<boolean>;
  readonly restore: (draft: Draft) => void;
  readonly discard: (draft: Draft) => void;
  readonly discardAll: () => void;
  /** The Document's text changed: recompute Unsaved, and keep the Draft. */
  readonly noteEdit: () => void;
  /**
   * Close the window, having asked about unsaved work first — the desktop's own
   * Quit item, which has to be ours because the predefined one takes the process
   * without `ExitRequested` ever firing (#1020, #1023).
   */
  readonly requestClose: () => void;
  /**
   * Get ready for the reload that takes a new version (#1025): keep the work,
   * stop the browser asking about leaving, and note which Document to come back
   * to — so the reload lands on it without the Restore list asking.
   */
  readonly prepareReload: () => Promise<void>;
}

export function useDocumentSession({
  platform,
  editorState,
  drafts: injected,
  reloadNotes: injectedNotes,
  onDraftWritten,
}: DocumentSessionOptions): DocumentSession {
  const prompt = usePrompt();
  const drafts = useMemo(() => injected ?? new DraftStore(), [injected]);
  const reloadNotes = useMemo(
    () => (injectedNotes === undefined ? webStorage("sessionStorage") : injectedNotes),
    [injectedNotes],
  );
  const [restorable, setRestorable] = useState<readonly Draft[]>([]);
  const [showsRecent, setShowsRecent] = useState(false);

  // Read through a ref, so a caller that passes a fresh closure on every render
  // does not rebuild the Draft writer underneath itself — which would cancel
  // the write it had pending.
  const readEditor = useRef(editorState);
  readEditor.current = editorState;
  const draftWritten = useRef(onDraftWritten);
  draftWritten.current = onDraftWritten;

  /**
   * The user asked to reload onto a new version: from here on nothing stands
   * between them and leaving, however the text moves in the moment before the
   * page goes (#1025).
   */
  const leaving = useRef(false);

  /**
   * The Document as the Draft store wants it. Pulled, so the text crosses out
   * of the editor once per write rather than once per keystroke.
   */
  const snapshot = useCallback((): DraftSnapshot | null => {
    const state = readEditor.current();
    if (!state) return null;
    const { document, identity, baseline, draftKey } = useStore.getState();
    return {
      key: draftKey,
      name: document.name,
      identity,
      text: documentText(state),
      baseline,
    };
  }, []);

  const writer = useMemo(
    () => new DraftWriter(drafts, snapshot, () => draftWritten.current?.()),
    [drafts, snapshot],
  );

  /**
   * The Document changed: the store re-decides whether it is Unsaved, and the
   * Draft is owed a write.
   *
   * The comparison is the store's own, not made here and reported: Unsaved is a
   * fact about the Document and the store is what holds the Baseline.
   */
  const noteEdit = useCallback(() => {
    const state = readEditor.current();
    if (!state) return;
    useStore.getState().noteText(documentText(state));
    writer.noteEdit();
  }, [writer]);

  // The flush that covers macOS Cmd+Q, which gives no other warning (#1054).
  // Through the seam, because the event is not the same one on both Platforms:
  // the Browser has `visibilitychange` and `blur`, the desktop has the window's
  // own focus change, and an OS-level deactivation is exactly the case where
  // relying on the webview to forward a DOM event would be a guess.
  useEffect(() => {
    let live = true;
    let stopFocus = () => {};
    void platform.then((host) => {
      if (!live) return;
      stopFocus = host.onFocusLost(() => writer.flush());
    });
    return () => {
      live = false;
      stopFocus();
      // Disposed rather than flushed: an unmount in a test is not a user
      // walking away, and the App unmounts only when the page is already gone.
      writer.dispose();
    };
  }, [platform, writer]);

  const refreshRecent = useCallback(async (host: Platform) => {
    useStore.getState().setRecent(await host.recentDocuments());
  }, []);

  /**
   * Write the Document however `attempt` says, and take what came of it.
   *
   * The two Saves differ only in that one line; everything after it — the
   * Baseline, the Draft, Recent and the Toasts — is the same either way, and is
   * the part that must not be written twice.
   */
  const write = useCallback(
    async (
      attempt: (host: Platform, target: SaveTarget, state: EditorState) => Promise<SaveResult>,
    ): Promise<SaveResult | null> => {
      const state = readEditor.current();
      if (!state) return null;
      const host = await platform;
      const { document, identity, baseline, documentSaved, showToast } = useStore.getState();
      const target: SaveTarget = { ...document, identity, baseline };

      try {
        const result = await attempt(host, target, state);

        if (result.outcome === "saved") {
          // Discarded *before* the Identity moves: the Draft is still filed
          // under whatever key this Document had a moment ago, and a write
          // scheduled just before the Save must not land after it.
          writer.discard();
          documentSaved(result.identity, result.text);
          await refreshRecent(host);
        } else if (result.outcome === "downloaded") {
          // The ordinary outcome on Firefox and Safari, and without this the
          // Save appears to do nothing at all (#1055 Q11).
          showToast(COPY.savedToDownloads);
        }
        return result;
      } catch (failure) {
        // A failure is a Toast and not a Prompt (#1055 Q15) — a denied
        // permission is the usual one, and it used to reach only the console.
        console.error("Save failed", failure);
        showToast(COPY.cannotSave(document.name));
        return null;
      }
    },
    [platform, refreshRecent, writer],
  );

  /** Save: back to the file, asking first if it changed underneath (Prompt B). */
  const save = useCallback(
    () =>
      write((host, target, state) =>
        saveDocument(
          host,
          target,
          state,
          async (name) => (await prompt.ask(overwritePrompt(name))) === OVERWRITE,
        ),
      ),
    [prompt, write],
  );

  /** Save As: always the Platform's dialog, whose own overwrite question it is. */
  const saveAs = useCallback(() => write(saveDocumentAs), [write]);

  /**
   * **Prompt A**: may something replace or close this Document?
   *
   * The Prompt asks about the *file*, never about the work: `Don't save` keeps
   * the Draft, which is why the Draft is flushed before the question is asked
   * rather than after it is answered (#1054).
   */
  const confirmReplace = useCallback(async (): Promise<boolean> => {
    const state = useStore.getState();
    if (!state.unsaved) return true;
    writer.flush();

    const answer = await prompt.ask(saveChangesPrompt(state.document.name, isUntitled(state)));
    if (answer === CANCEL) return false;
    if (answer === DONT_SAVE) return true;

    // A download is a file the user now has, so it is leave enough to go on
    // with — even though the Document itself stays Unsaved. A cancelled dialog
    // or a failed write is not, and leaves the Document where it was.
    const result = await save();
    return result?.outcome === "saved" || result?.outcome === "downloaded";
  }, [prompt, writer, save]);

  const adopt = useCallback(
    async (opened: OpenedDocument, host: Platform) => {
      useStore.getState().documentOpened(opened);
      await refreshRecent(host);
    },
    [refreshRecent],
  );

  /**
   * What became of a delivery of files — a dialog pick, a drop, an OS "open
   * with", a launch. Every route ends here, which is what keeps one wording and
   * one order of events for all of them (#1018).
   *
   * `confirmed` is for the routes that have already asked: Open asks *before*
   * opening the dialog, because a picker the answer will throw away should never
   * appear. A drop cannot — the file is already in hand — so it asks here.
   *
   * The refusal is checked first and asks nothing: an unsupported file replaces
   * nothing, so there is no unsaved work at stake and no question to put.
   */
  const receive = useCallback(
    async (delivery: OpenDelivery, host: Platform, confirmed: boolean): Promise<boolean> => {
      const { showToast } = useStore.getState();
      if (delivery.outcome === "unsupported") {
        showToast(COPY.cannotOpenFile(delivery.name));
        return false;
      }
      if (!confirmed && !(await confirmReplace())) return false;

      await adopt(delivery.opened, host);
      // Said after the Document is on screen, and only then: a Toast about what
      // opened would be a lie if the Prompt above had turned the open away.
      if (delivery.count > 1) showToast(COPY.openedOneOfSeveral(delivery.count));
      return true;
    },
    [adopt, confirmReplace],
  );

  /**
   * Open: Prompt A, then the Platform's dialog (#1018).
   *
   * In that order because the dialog is the OS's and cannot be taken back — a
   * user who answers Cancel to "Save your changes?" has cancelled the Open, and
   * must not then be handed a file picker to dismiss as well.
   */
  const openDocument = useCallback(async (): Promise<void> => {
    if (!(await confirmReplace())) return;
    const host = await platform;
    const delivery = await host.openDocument();
    if (delivery) await receive(delivery, host, true);
  }, [confirmReplace, platform, receive]);

  /**
   * A Recent entry, clicked — the only time an entry is ever checked (#1054).
   *
   * The three failures are three different things: a denial leaves the entry
   * where it was, because the file is fine and clicking again and allowing is
   * the fix; a file that has gone has already been pruned by the Platform, and
   * the Toast says so because the user is about to watch the menu change.
   */
  const openRecent = useCallback(
    async (ref: DocumentRef) => {
      if (!(await confirmReplace())) return;
      const host = await platform;
      const { showToast } = useStore.getState();
      const result = await openFromRecent(host, ref);
      switch (result.outcome) {
        case "opened":
          await adopt(result.opened, host);
          return;
        case "denied":
          showToast(COPY.cannotOpenWithoutPermission(result.name));
          return;
        case "missing":
          showToast(COPY.movedOrDeleted(result.name));
          await refreshRecent(host);
      }
    },
    [adopt, confirmReplace, platform, refreshRecent],
  );

  /**
   * New, and an Example: the two Documents that come from inside Pikchard.
   *
   * Both go through Prompt A, because #1054 put it on *every* replacement, and
   * both produce an **Untitled** Document — no Name, no Identity, and so never an
   * entry in Recent (#1054).
   */
  const newDocument = useCallback(async (): Promise<void> => {
    if (!(await confirmReplace())) return;
    writer.discard();
    useStore.getState().documentCreated();
  }, [confirmReplace, writer]);

  const openExample = useCallback(
    async (example: Example): Promise<void> => {
      if (!(await confirmReplace())) return;
      writer.discard();
      // Through `documentOpened` with no Identity, which is what makes it
      // Untitled: the Example's own name is the menu's, never the Document's.
      useStore.getState().documentOpened({ name: UNTITLED, text: example.script, identity: null });
    },
    [confirmReplace, writer],
  );

  const restore = useCallback(
    (draft: Draft) => {
      // Restoring consumes the offer: the Draft comes out of the store, because
      // it is the Document now.
      //
      // It comes *back* a second later, and must: a restored Document is Unsaved
      // against the file it came from, so the work is still only in Pikchard and
      // still needs the insurance. What the discard buys is that the list is an
      // offer made once — not that the work is now unprotected.
      drafts.discard(draft.key);
      useStore.getState().documentRestored(draft);
      setRestorable([]);
    },
    [drafts],
  );

  const discard = useCallback(
    (draft: Draft) => {
      drafts.discard(draft.key);
      setRestorable((rest) => rest.filter((entry) => entry.key !== draft.key));
    },
    [drafts],
  );

  const discardAll = useCallback(() => {
    // Only what was offered: a Draft that matches its Baseline was never shown,
    // and "Discard all" is an answer to the list on screen.
    for (const draft of restorable) drafts.discard(draft.key);
    setRestorable([]);
  }, [drafts, restorable]);

  // Read through a ref so the subscriptions below are made once, whatever the
  // callbacks' identities do.
  const latest = useRef({ receive, confirmReplace });
  latest.current = { receive, confirmReplace };

  /**
   * Launch (#1054).
   *
   * Subscribe *before* draining: the desktop treats the drain as the signal that
   * someone is listening and queues "open with" paths until then, so draining
   * first would drop a double-clicked file.
   *
   * Restore is offered only when the launch carries nothing to open. When it
   * does carry a Document, that Document's own unsaved work is offered alone,
   * and every other Draft survives to the next plain launch.
   */
  useEffect(() => {
    let live = true;
    let stopOpen = () => {};

    void (async () => {
      const host = await platform;
      if (!live) return;

      stopOpen = host.onOpenRequested((delivery) => {
        void latest.current.receive(delivery, host, false);
      });

      const launched = await host.takeLaunchDelivery();
      if (!live) return;

      // Read whatever else this launch is, so the note is spent by the one
      // launch it was written for.
      const returningTo = takeUpdateReload(reloadNotes);

      // A launch that brought nothing — or brought something Pikchard will not
      // open — is a plain launch: the unsaved work from last time is then the
      // most useful thing on screen (#1018).
      const opened = launched && (await latest.current.receive(launched, host, true));
      if (opened && launched?.outcome === "opened") {
        const { identity } = launched.opened;
        const own = identity ? drafts.restorableFor(identity.key) : undefined;
        setRestorable(own ? [own] : []);
      } else if (returningTo !== null) {
        // The reload the user asked for, to take a new version (#1025). A
        // narrow, marked exception to #1054's Restore list: re-asking about the
        // work they were just told would be kept is the app failing to remember
        // what it was told. Every other Draft survives to the next plain launch.
        const own = drafts.restorableFor(returningTo);
        if (own) {
          drafts.discard(own.key);
          useStore.getState().documentRestored(own);
        }
        setRestorable([]);
        await refreshRecent(host);
      } else {
        setRestorable(drafts.restorable());
        await refreshRecent(host);
      }
    })();

    return () => {
      live = false;
      stopOpen();
    };
  }, [drafts, platform, refreshRecent, reloadNotes]);

  /**
   * The close the user asked for, held back for Prompt A.
   *
   * On the Browser this never fires — the browser asks about leaving on its own
   * terms, uncustomisably, and `preventClose` is what arms it (#1100 D).
   */
  useEffect(() => {
    let live = true;
    let stopClose = () => {};
    void platform.then((host) => {
      if (!live) return;
      stopClose = host.onCloseRequested(() => {
        void (async () => {
          if (await latest.current.confirmReplace()) await host.closeWindow();
        })();
      });
    });
    return () => {
      live = false;
      stopClose();
    };
  }, [platform]);

  const requestClose = useCallback(() => {
    void (async () => {
      const host = await platform;
      if (await confirmReplace()) await host.closeWindow();
    })();
  }, [confirmReplace, platform]);

  const unsaved = useStore((state) => state.unsaved);
  const name = useStore((state) => state.document.name);

  /**
   * What the window is called, and whether the host stands between the user and
   * closing it. Both are functions of Unsaved and the Name, and of nothing else:
   * the title carries the dot's counterpart (#1047), and `preventClose` arms the
   * browser's own "Leave site?" dialog — registered only while there is
   * something to lose, because Firefox will not bfcache a page that has a
   * `beforeunload` listener at all (#1054).
   */
  useEffect(() => {
    void platform.then((host) => {
      host.setTitle(windowTitle(name, unsaved));
      host.preventClose(unsaved && !leaving.current);
    });
  }, [platform, name, unsaved]);

  useEffect(() => {
    void platform.then((host) => setShowsRecent(host.capabilities.persistsRecentDocuments));
  }, [platform]);

  const prepareReload = useCallback(async () => {
    writer.flush();
    markUpdateReload(useStore.getState().draftKey, reloadNotes);
    leaving.current = true;
    (await platform).preventClose(false);
  }, [platform, reloadNotes, writer]);

  return {
    prompt,
    showsRecent,
    restorable,
    save,
    saveAs,
    open: openDocument,
    newDocument,
    openExample,
    confirmReplace,
    openRecent,
    restore,
    discard,
    discardAll,
    noteEdit,
    requestClose,
    prepareReload,
  };
}
