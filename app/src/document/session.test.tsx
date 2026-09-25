/**
 * The Document's life, end to end (#1020): Save, Save As, the Draft, Recent,
 * Restore and the three Prompts, over a real store and a `FakePlatform`.
 *
 * The editor is stood in for rather than mounted — CodeMirror is #1085's and is
 * tested there — but everything else is the real thing, including the Prompts,
 * because what most of these criteria are *about* is which button says what.
 */

import { EditorState } from "@codemirror/state";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DocumentFidelity, fidelityExtension } from "../editor/fidelity.js";
import { markUpdateReload, takeUpdateReload } from "../offline/update-reload.js";
import { FakePlatform } from "../platform/fake.js";
import { memoryStore } from "../platform/storage.js";
import { type DocumentRef, opening, refusing } from "../platform/types.js";
import { Prompt } from "../shell/Prompt.js";
import { CANCEL, DONT_SAVE, OVERWRITE, SAVE } from "../shell/prompts.js";
import { RestorePrompt } from "../shell/RestorePrompt.js";
import { NEW_DOCUMENT_SCRIPT, UNTITLED, useStore } from "../store.js";
import { DRAFT_DEBOUNCE_MS } from "./autosave.js";
import { type Draft, DraftStore } from "./drafts.js";
import {
  type DocumentSession,
  type DocumentSessionOptions,
  useDocumentSession,
} from "./session.js";

// React's own switch for `act`: without it every async act warns and the
// updates it is meant to flush do not settle.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useStore.getState();

let container: HTMLDivElement;
let root: Root;
let session: DocumentSession;

/** The editor, as far as the session is concerned: a state it can read. */
interface StandInEditor {
  state: EditorState;
  applied: DocumentFidelity | null;
}

function stateFor(fidelity: DocumentFidelity): EditorState {
  return EditorState.create({
    doc: fidelity.text,
    extensions: [fidelityExtension(fidelity)],
  });
}

function Harness({
  platform,
  drafts,
  editor,
  extra,
}: {
  platform: Promise<FakePlatform>;
  drafts: DraftStore;
  editor: StandInEditor;
  extra: Extra;
}) {
  const live = useDocumentSession({ platform, drafts, editorState: () => editor.state, ...extra });
  session = live;
  const document = useStore((state) => state.document);

  // Stand in for the Editor: a different Document is new text on the same
  // editor, and the change is announced the way the real one announces it.
  useEffect(() => {
    if (editor.applied === document.fidelity) return;
    editor.applied = document.fidelity;
    editor.state = stateFor(document.fidelity);
    live.noteEdit();
  });

  return (
    <>
      <Prompt pending={live.prompt.pending} />
      <RestorePrompt
        drafts={live.restorable}
        onRestore={live.restore}
        onDiscard={live.discard}
        onDiscardAll={live.discardAll}
      />
    </>
  );
}

/** The session's other options, where a test needs them. */
type Extra = Partial<Pick<DocumentSessionOptions, "reloadNotes" | "onDraftWritten">>;

/** Mount the session over a Platform and a Draft store, and settle the launch. */
async function open(
  platform: FakePlatform,
  drafts = new DraftStore(memoryStore()),
  // A tab's own `sessionStorage`, fresh per test unless one is passed.
  extra: Extra = { reloadNotes: memoryStore() },
) {
  const editor: StandInEditor = {
    state: stateFor(useStore.getState().document.fidelity),
    applied: null,
  };
  await act(async () => {
    root.render(
      <Harness
        platform={Promise.resolve(platform)}
        drafts={drafts}
        editor={editor}
        extra={extra}
      />,
    );
  });
  // The launch is several awaits deep: the Platform resolves, the queue is
  // drained, and only then is anything opened or offered.
  await settle();
  return { editor, drafts };
}

/** Type into the stand-in editor, and tell the session about it. */
async function type(editor: StandInEditor, text: string) {
  await act(async () => {
    editor.state = editor.state.update({
      changes: { from: 0, to: editor.state.doc.length, insert: text },
    }).state;
    session.noteEdit();
  });
}

/** Let every promise the last act started settle, and render what came of it. */
async function settle() {
  await act(async () => {});
  await act(async () => {});
}

/**
 * Begin something that stops at a Prompt, and leave it stopped there.
 *
 * The operation is handed back **wrapped**: awaiting a promise that resolves to
 * a promise would await both, which here means waiting for the answer to a
 * Prompt nobody has clicked yet.
 */
async function begin(start: () => Promise<unknown>): Promise<{ done: Promise<unknown> }> {
  const done = start();
  await settle();
  return { done };
}

const find = (selector: string) => container.querySelector(selector) as HTMLElement | null;
const answer = async (id: string) => {
  await act(async () => {
    (find(`[data-testid='prompt-${id}']`) as HTMLButtonElement).click();
  });
};
const click = async (testid: string) => {
  await act(async () => {
    (find(`[data-testid='${testid}']`) as HTMLButtonElement).click();
  });
};

const draft = (over: Partial<Draft> = {}): Draft => ({
  key: "/notes.md",
  name: "notes.md",
  identity: { key: "/notes.md", name: "notes.md" },
  text: "circle\n",
  baseline: "box\n",
  at: Date.now() - 60 * 60 * 1000,
  ...over,
});

/** A Document the Platform already has, opened, so the store is on it. */
async function opened(platform: FakePlatform, text = "box\n"): Promise<DocumentRef> {
  const identity = platform.addFile("/notes.md", "notes.md", text);
  await act(async () => {
    useStore.getState().documentOpened({ name: "notes.md", text, identity });
  });
  return identity;
}

beforeEach(() => {
  useStore.setState(initialState, true);
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Save", () => {
  it("writes the Document back and takes the text it wrote as the Baseline", async () => {
    const platform = new FakePlatform({ kind: "desktop" });
    await opened(platform);
    const { editor } = await open(platform);
    await type(editor, "circle\n");
    expect(useStore.getState().unsaved).toBe(true);

    await act(async () => {
      await session.save();
    });
    await settle();

    expect(platform.saved).toEqual([{ key: "/notes.md", text: "circle\n" }]);
    expect(useStore.getState().baseline).toBe("circle\n");
    expect(useStore.getState().unsaved).toBe(false);
  });

  it("leaves a saved Document with no unsaved work kept anywhere", async () => {
    vi.useFakeTimers();
    const platform = new FakePlatform();
    await opened(platform);
    const { editor, drafts } = await open(platform);
    await type(editor, "circle\n");
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(drafts.list()).toHaveLength(1);

    await act(async () => {
      await session.save();
    });
    await settle();

    expect(drafts.list()).toEqual([]);
  });

  it("asks where to put an Untitled Document, and moves its work onto the Identity", async () => {
    vi.useFakeTimers();
    const platform = new FakePlatform();
    const chosen = { key: "/chosen.pikchr", name: "chosen.pikchr" };
    platform.nextSaveAs = { outcome: "saved", identity: chosen };
    const { editor, drafts } = await open(platform);
    await type(editor, "circle\n");
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    // The work is kept under the id the Untitled Document was born with.
    expect(drafts.list()[0]?.key).toMatch(/^untitled:/);

    await act(async () => {
      await session.save();
    });
    await settle();

    expect(platform.saveAsPrompts).toEqual([`${UNTITLED}.pikchr`]);
    expect(useStore.getState().identity).toEqual(chosen);
    expect(useStore.getState().draftKey).toBe("/chosen.pikchr");
    expect(drafts.list()).toEqual([]);
  });

  it("puts a Document that has just been saved somewhere new into Recent", async () => {
    const platform = new FakePlatform();
    platform.nextSaveAs = { outcome: "saved", identity: { key: "/new.md", name: "new.md" } };
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      await session.saveAs();
    });
    await settle();

    expect(useStore.getState().recent.map((entry) => entry.key)).toEqual(["/new.md"]);
  });

  it("says so when the file could only go to the downloads folder", async () => {
    // The ordinary outcome on Firefox and Safari: without the Toast, Save
    // appears to do nothing at all (#1055 Q11).
    const platform = new FakePlatform({ capabilities: { saveInPlace: false } });
    platform.nextSaveAs = { outcome: "downloaded" };
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      await session.save();
    });
    await settle();

    expect(useStore.getState().toasts.at(-1)?.message).toBe("Saved to your downloads");
    // A download leaves the Document exactly as Unsaved as it was (#1054).
    expect(useStore.getState().unsaved).toBe(true);
  });

  it("says so when the Save failed", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    platform.saveDocument = () => Promise.reject(new Error("denied"));
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      await session.save();
    });
    await settle();

    expect(useStore.getState().toasts.at(-1)?.message).toBe("Can't save notes.md");
    expect(useStore.getState().unsaved).toBe(true);
  });

  it("asks before overwriting a file that changed underneath, and respects Cancel", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    // Someone else wrote to the file after Pikchard opened it.
    platform.addFile(identity.key, identity.name, "someone else\n");
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    const { done: saving } = await begin(() => session.save());
    expect(find(".prompt__title")?.textContent).toBe("Overwrite notes.md?");
    await answer(CANCEL);
    await act(async () => {
      await saving;
    });

    expect(platform.saved).toEqual([]);
    expect(useStore.getState().unsaved).toBe(true);
  });

  it("overwrites when the user says to", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    platform.addFile(identity.key, identity.name, "someone else\n");
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    const { done: saving } = await begin(() => session.save());
    await answer(OVERWRITE);
    await act(async () => {
      await saving;
    });

    expect(platform.saved).toEqual([{ key: "/notes.md", text: "circle\n" }]);
  });
});

describe("the Draft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("is written once the typing stops, and not before", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const { editor, drafts } = await open(platform);

    await type(editor, "circle\n");
    expect(drafts.list()).toEqual([]);

    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });

    expect(drafts.list()).toMatchObject([
      { key: "/notes.md", name: "notes.md", text: "circle\n", baseline: "box\n" },
    ]);
  });

  it("is written at once when the app stops being looked at", async () => {
    // What covers macOS Cmd+Q, which gives no other warning — and it comes
    // through the Platform, because the event is not the same one on both
    // (#1054).
    const platform = new FakePlatform();
    await opened(platform);
    const { editor, drafts } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      platform.emitFocusLost();
    });

    expect(drafts.list()).toHaveLength(1);
  });

  it("is deleted when the text is edited back to the Baseline", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const { editor, drafts } = await open(platform);
    await type(editor, "circle\n");
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });

    await type(editor, "box\n");
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });

    expect(drafts.list()).toEqual([]);
    expect(useStore.getState().unsaved).toBe(false);
  });
});

describe("replacing an Unsaved Document (#1100 Prompt A)", () => {
  /** A Document open and edited, and a Recent entry to replace it with. */
  async function edited() {
    const platform = new FakePlatform();
    await opened(platform);
    const other = platform.addFile("/other.md", "other.md", "arrow\n");
    const mounted = await open(platform);
    await type(mounted.editor, "circle\n");
    return { platform, other, ...mounted };
  }

  it("asks about the file, by name", async () => {
    const { other } = await edited();

    const { done: opening } = await begin(() => session.openRecent(other));

    expect(find(".prompt__title")?.textContent).toBe("Save changes to notes.md?");
    expect(find(".prompt__body")?.textContent).toBe(
      "Not saving keeps your changes in Pikchard, but not in the file.",
    );
    await answer(CANCEL);
    await act(async () => {
      await opening;
    });
  });

  it("replaces nothing on Cancel", async () => {
    const { other } = await edited();

    const { done: opening } = await begin(() => session.openRecent(other));
    await answer(CANCEL);
    await act(async () => {
      await opening;
    });

    expect(useStore.getState().document.name).toBe("notes.md");
    expect(useStore.getState().unsaved).toBe(true);
  });

  it("keeps the work in Pikchard on Don't save, which is what the Prompt promises", async () => {
    vi.useFakeTimers();
    const { other, drafts } = await edited();

    const { done: opening } = await begin(() => session.openRecent(other));
    await answer(DONT_SAVE);
    await act(async () => {
      await opening;
    });

    expect(useStore.getState().document.name).toBe("other.md");
    // Flushed before the question, not after the answer: the Prompt asks about
    // the file and never about the work (#1054).
    expect(drafts.list()).toMatchObject([{ key: "/notes.md", text: "circle\n" }]);
  });

  it("saves first on Save, and then replaces", async () => {
    const { platform, other } = await edited();

    const { done: opening } = await begin(() => session.openRecent(other));
    await answer(SAVE);
    await act(async () => {
      await opening;
    });

    expect(platform.saved).toEqual([{ key: "/notes.md", text: "circle\n" }]);
    expect(useStore.getState().document.name).toBe("other.md");
    expect(useStore.getState().unsaved).toBe(false);
  });

  it("does not ask at all when there is nothing to lose", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const other = platform.addFile("/other.md", "other.md", "arrow\n");
    await open(platform);

    await act(async () => {
      await session.openRecent(other);
    });
    await settle();

    expect(find("[data-testid='prompt']")).toBeNull();
    expect(useStore.getState().document.name).toBe("other.md");
  });
});

describe("Recent", () => {
  it("opens the entry that was clicked", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    await open(platform);

    await act(async () => {
      await session.openRecent(identity);
    });
    await settle();

    expect(useStore.getState().document.fidelity.text).toBe("box\n");
    expect(useStore.getState().identity).toEqual(identity);
  });

  it("keeps the entry when the user denied permission, and says nothing of the list", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    await open(platform);
    platform.breakFile(identity.key, "denied");

    await act(async () => {
      await session.openRecent(identity);
    });
    await settle();

    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Can't open notes.md without permission",
    );
    expect(useStore.getState().toasts.at(-1)?.message).not.toContain("Recent");
  });

  it("says that a file which has gone was removed, and stops listing it", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    // Opened through the Platform, so Recent holds it.
    platform.nextOpen = opening({ name: "notes.md", text: "box\n", identity });
    await platform.openDocument();
    await open(platform);
    await act(async () => useStore.getState().setRecent(await platform.recentDocuments()));
    expect(useStore.getState().recent).toHaveLength(1);

    platform.breakFile(identity.key, "missing");
    await act(async () => {
      await session.openRecent(identity);
    });
    await settle();

    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "notes.md has moved or been deleted — removed from Recent",
    );
    expect(useStore.getState().recent).toEqual([]);
  });

  it("is not offered at all where the Platform keeps none", async () => {
    const platform = new FakePlatform({ capabilities: { persistsRecentDocuments: false } });
    await open(platform);

    expect(session.showsRecent).toBe(false);
  });
});

describe("Open", () => {
  it("replaces the Document with the one the user picked, Identity and all", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = opening({
      name: "picked.md",
      text: "circle\n",
      identity: { key: "/picked.md", name: "picked.md" },
    });
    await open(platform);

    await act(async () => {
      await session.open();
    });
    await settle();

    expect(useStore.getState().document.name).toBe("picked.md");
    expect(useStore.getState().document.fidelity.text).toBe("circle\n");
    expect(useStore.getState().identity?.key).toBe("/picked.md");
    expect(useStore.getState().unsaved).toBe(false);
    // Open confers an Identity, so the Document it replaced is reachable again.
    expect(useStore.getState().recent.map((entry) => entry.key)).toEqual(["/picked.md"]);
  });

  it("asks about unsaved work first, and never opens the dialog on Cancel", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = opening({ name: "picked.md", text: "circle\n", identity: null });
    const { editor } = await open(platform);
    await type(editor, "arrow\n");

    const { done: opening_ } = await begin(() => session.open());
    expect(find(".prompt__title")?.textContent).toBe("Save your changes?");
    await answer(CANCEL);
    await act(async () => {
      await opening_;
    });

    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(platform.openPrompts).toBe(0);
  });

  it("leaves the Document alone when the dialog was cancelled", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = null;
    await open(platform);

    await act(async () => {
      await session.open();
    });
    await settle();

    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(useStore.getState().toasts).toEqual([]);
  });

  it("refuses a file it does not open, and says what it does open", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = refusing("notes.pdf");
    await open(platform);

    await act(async () => {
      await session.open();
    });
    await settle();

    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Can't open notes.pdf — Pikchard opens Pikchr and Markdown files",
    );
    expect(useStore.getState().document.name).toBe(UNTITLED);
  });

  it("opens the first of several files at once, and says how many arrived", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = opening(
      { name: "first.md", text: "box\n", identity: { key: "/first.md", name: "first.md" } },
      3,
    );
    await open(platform);

    await act(async () => {
      await session.open();
    });
    await settle();

    expect(useStore.getState().document.name).toBe("first.md");
    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Opened 1 of 3 files — Pikchard opens one at a time",
    );
  });
});

describe("New", () => {
  it("replaces the Document with an Untitled one on the seed Script", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    await open(platform);

    await act(async () => {
      await session.newDocument();
    });
    await settle();

    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(useStore.getState().document.fidelity.text).toBe(NEW_DOCUMENT_SCRIPT);
    expect(useStore.getState().identity).toBeNull();
    expect(useStore.getState().unsaved).toBe(false);
    // The cursor waits at the end of the seed: the user's next keystroke
    // continues the Script rather than landing in front of it (#1044).
    expect(useStore.getState().document.caret).toBe("end");
  });

  it("asks about unsaved work first, and stays put on Cancel", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    const { done } = await begin(() => session.newDocument());
    expect(find(".prompt__title")?.textContent).toBe("Save changes to notes.md?");
    await answer(CANCEL);
    await act(async () => {
      await done;
    });

    expect(useStore.getState().document.name).toBe("notes.md");
  });

  it("gives the new Document a Draft of its own, never the old one's", async () => {
    const platform = new FakePlatform();
    const identity = await opened(platform);
    await open(platform);
    expect(useStore.getState().draftKey).toBe(identity.key);

    await act(async () => {
      await session.newDocument();
    });

    expect(useStore.getState().draftKey).toMatch(/^untitled:/);
  });
});

describe("an Example", () => {
  it("opens as an Untitled Document, and never enters Recent", async () => {
    const platform = new FakePlatform();
    await open(platform);

    await act(async () => {
      await session.openExample({ name: "Flowchart", script: "diamond\n" });
    });
    await settle();

    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(useStore.getState().document.fidelity.text).toBe("diamond\n");
    expect(useStore.getState().identity).toBeNull();
    expect(useStore.getState().recent).toEqual([]);
    expect(useStore.getState().unsaved).toBe(false);
  });

  it("asks about unsaved work first, like every other replacement", async () => {
    const platform = new FakePlatform();
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    const { done } = await begin(() =>
      session.openExample({ name: "Flowchart", script: "diamond\n" }),
    );
    expect(find(".prompt__title")?.textContent).toBe("Save your changes?");
    await answer(CANCEL);
    await act(async () => {
      await done;
    });

    expect(useStore.getState().document.fidelity.text).toBe(NEW_DOCUMENT_SCRIPT);
  });
});

describe("launch", () => {
  it("offers the unsaved work from last time when there is nothing else to open", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    // At its Baseline, so there is nothing to restore about it.
    drafts.write(draft({ key: "/same.md", name: "same.md", text: "box\n", baseline: "box\n" }));

    await open(new FakePlatform(), drafts);

    expect(find("[data-testid='restore-prompt']")).not.toBeNull();
    expect(session.restorable.map((entry) => entry.key)).toEqual(["/notes.md"]);
  });

  it("offers nothing when there is no unsaved work", async () => {
    await open(new FakePlatform());

    expect(find("[data-testid='restore-prompt']")).toBeNull();
  });

  it("opens the Document the OS handed over, and skips the list", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/launched.md", "launched.md", "arrow\n");
    platform.setLaunchDelivery(opening({ name: "launched.md", text: "arrow\n", identity }));
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());

    await open(platform, drafts);

    expect(useStore.getState().document.name).toBe("launched.md");
    expect(session.restorable).toEqual([]);
    // The work survives to the next plain launch rather than being dropped.
    expect(drafts.list()).toHaveLength(1);
  });

  it("offers the launched Document's own unsaved work, alone", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");
    platform.setLaunchDelivery(opening({ name: "notes.md", text: "box\n", identity }));
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    drafts.write(draft({ key: "/elsewhere.md", name: "elsewhere.md" }));

    await open(platform, drafts);

    expect(session.restorable.map((entry) => entry.key)).toEqual(["/notes.md"]);
  });

  it("opens a Document the OS hands over while already running", async () => {
    const platform = new FakePlatform();
    await open(platform);
    const identity = platform.addFile("/dropped.md", "dropped.md", "arrow\n");

    await act(async () => {
      platform.emitOpenRequested(opening({ name: "dropped.md", text: "arrow\n", identity }));
    });
    await settle();

    expect(useStore.getState().document.name).toBe("dropped.md");
  });

  it("says how many files arrived when the OS hands over several", async () => {
    const platform = new FakePlatform();
    await open(platform);
    const identity = platform.addFile("/first.md", "first.md", "arrow\n");

    await act(async () => {
      platform.emitOpenRequested(opening({ name: "first.md", text: "arrow\n", identity }, 3));
    });
    await settle();

    expect(useStore.getState().document.name).toBe("first.md");
    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Opened 1 of 3 files — Pikchard opens one at a time",
    );
  });

  it("refuses a dropped file it does not open, without asking about anything", async () => {
    // Nothing is being replaced, so there is nothing to ask about: the refusal
    // is a Toast and the Document on screen is untouched (#1018).
    const platform = new FakePlatform();
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      platform.emitOpenRequested(refusing("notes.pdf"));
    });
    await settle();

    expect(find("[data-testid='prompt']")).toBeNull();
    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Can't open notes.pdf — Pikchard opens Pikchr and Markdown files",
    );
    expect(useStore.getState().document.fidelity.text).toBe(NEW_DOCUMENT_SCRIPT);
  });

  it("asks about unsaved work before a dropped Document replaces it", async () => {
    const platform = new FakePlatform();
    const { editor } = await open(platform);
    await type(editor, "circle\n");
    const identity = platform.addFile("/dropped.md", "dropped.md", "arrow\n");

    await act(async () => {
      platform.emitOpenRequested(opening({ name: "dropped.md", text: "arrow\n", identity }));
    });
    await settle();
    expect(find(".prompt__title")?.textContent).toBe("Save your changes?");
    await answer(CANCEL);

    expect(useStore.getState().document.name).toBe(UNTITLED);
  });

  it("refuses a file the OS handed over at launch, and launches as if it had not", async () => {
    // A refused launch file is not a launch with a Document in it: the unsaved
    // work from last time is still the most useful thing on screen (#1018).
    const platform = new FakePlatform();
    platform.setLaunchDelivery(refusing("photo.png"));
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());

    await open(platform, drafts);

    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(useStore.getState().toasts.at(-1)?.message).toBe(
      "Can't open photo.png — Pikchard opens Pikchr and Markdown files",
    );
    expect(session.restorable.map((entry) => entry.key)).toEqual(["/notes.md"]);
  });
});

describe("Restore and Discard", () => {
  it("brings the work back as the Document it belonged to, still Unsaved", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    await open(new FakePlatform(), drafts);

    await click("restore");

    expect(useStore.getState().document.name).toBe("notes.md");
    expect(useStore.getState().document.fidelity.text).toBe("circle\n");
    expect(useStore.getState().unsaved).toBe(true);
    // The Baseline is still the file's, so a later Save compares against it.
    expect(useStore.getState().baseline).toBe("box\n");
    // Restored work is out of the store: it is the Document now.
    expect(drafts.list()).toEqual([]);
    expect(find("[data-testid='restore-prompt']")).toBeNull();
  });

  it("keeps insuring the work it just restored", async () => {
    // The Draft comes out of the store because the *offer* was taken, not
    // because the work is now safe: a restored Document is Unsaved against the
    // file it came from, so the next quiet second writes it again.
    vi.useFakeTimers();
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    await open(new FakePlatform(), drafts);

    await click("restore");
    expect(drafts.list()).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });

    expect(drafts.list()).toMatchObject([
      { key: "/notes.md", text: "circle\n", baseline: "box\n" },
    ]);
  });

  it("throws one row's work away and leaves the rest", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    drafts.write(draft({ key: "/other.md", name: "other.md" }));
    await open(new FakePlatform(), drafts);

    await click("discard-/notes.md");

    expect(drafts.list().map((entry) => entry.key)).toEqual(["/other.md"]);
    expect(session.restorable.map((entry) => entry.key)).toEqual(["/other.md"]);
  });

  it("throws the lot away in one go", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    drafts.write(draft({ key: "/other.md", name: "other.md" }));
    await open(new FakePlatform(), drafts);

    await click("discard-all");

    expect(drafts.list()).toEqual([]);
    expect(find("[data-testid='restore-prompt']")).toBeNull();
  });
});

describe("the window, while the Document is Unsaved", () => {
  it("is called after the Document, with the dot's counterpart in it", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const { editor } = await open(platform);

    expect(platform.title).toBe("notes.md — Pikchard");

    await type(editor, "circle\n");

    expect(platform.title).toBe("• notes.md — Pikchard");
  });

  it("stands between the user and closing only while there is something to lose", async () => {
    const platform = new FakePlatform({ kind: "desktop" });
    await opened(platform);
    const { editor } = await open(platform);

    expect(platform.closePrevented).toBe(false);

    await type(editor, "circle\n");
    expect(platform.closePrevented).toBe(true);

    await act(async () => {
      await session.save();
    });
    await settle();
    expect(platform.closePrevented).toBe(false);
  });

  it("asks before closing, and closes once the answer is in", async () => {
    const platform = new FakePlatform({ kind: "desktop" });
    await opened(platform);
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      platform.emitCloseRequested();
    });
    await settle();
    expect(find(".prompt__title")?.textContent).toBe("Save changes to notes.md?");
    await answer(DONT_SAVE);

    expect(platform.closed).toBe(true);
  });

  it("stays open on Cancel", async () => {
    const platform = new FakePlatform({ kind: "desktop" });
    await opened(platform);
    const { editor } = await open(platform);
    await type(editor, "circle\n");

    await act(async () => {
      platform.emitCloseRequested();
    });
    await settle();
    await answer(CANCEL);

    expect(platform.closed).toBe(false);
  });

  it("closes without asking when the Document is saved", async () => {
    const platform = new FakePlatform({ kind: "desktop" });
    await opened(platform);
    await open(platform);

    await act(async () => {
      platform.emitCloseRequested();
    });
    await settle();

    expect(find("[data-testid='prompt']")).toBeNull();
    expect(platform.closed).toBe(true);
  });
});

describe("taking a new version (#1025)", () => {
  it("keeps the unsaved work before the reload, however recently it was typed", async () => {
    vi.useFakeTimers();
    const platform = new FakePlatform();
    await opened(platform);
    const { editor, drafts } = await open(platform);
    await type(editor, "circle\n");
    expect(drafts.list()).toEqual([]);

    await act(async () => {
      await session.prepareReload();
    });

    expect(drafts.list()).toMatchObject([{ key: "/notes.md", text: "circle\n" }]);
  });

  it("stops the browser asking about leaving, since the user asked to reload", async () => {
    // The browser's generic "Leave site?" dialog, on a reload the user asked
    // for, would be the app questioning its own user.
    const platform = new FakePlatform();
    await opened(platform);
    const { editor } = await open(platform);
    await type(editor, "circle\n");
    expect(platform.closePrevented).toBe(true);

    await act(async () => {
      await session.prepareReload();
    });
    await type(editor, "circle\narrow\n");

    expect(platform.closePrevented).toBe(false);
  });

  it("notes which Document the reload is to come back to", async () => {
    const platform = new FakePlatform();
    await opened(platform);
    const reloadNotes = memoryStore();
    await open(platform, new DraftStore(memoryStore()), { reloadNotes });

    await act(async () => {
      await session.prepareReload();
    });

    expect(takeUpdateReload(reloadNotes)).toBe("/notes.md");
  });

  it("comes back on the same work without asking, which is what the user was told", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft());
    drafts.write(draft({ key: "/other.md", name: "other.md" }));
    const reloadNotes = memoryStore();
    markUpdateReload("/notes.md", reloadNotes);

    await open(new FakePlatform(), drafts, { reloadNotes });

    expect(find("[data-testid='restore-prompt']")).toBeNull();
    expect(useStore.getState().document.name).toBe("notes.md");
    expect(useStore.getState().document.fidelity.text).toBe("circle\n");
    expect(useStore.getState().unsaved).toBe(true);
    // The other Document's work survives to the next plain launch.
    expect(drafts.list().map((entry) => entry.key)).toEqual(["/other.md"]);
  });

  it("asks nothing when there was no unsaved work to come back to", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft({ key: "/other.md", name: "other.md" }));
    const reloadNotes = memoryStore();
    markUpdateReload("untitled:gone", reloadNotes);

    await open(new FakePlatform(), drafts, { reloadNotes });

    expect(find("[data-testid='restore-prompt']")).toBeNull();
    expect(drafts.list().map((entry) => entry.key)).toEqual(["/other.md"]);
  });

  it("is an ordinary launch the next time, with the list offered as usual", async () => {
    const drafts = new DraftStore(memoryStore());
    drafts.write(draft({ key: "/other.md", name: "other.md" }));
    const reloadNotes = memoryStore();
    markUpdateReload("untitled:gone", reloadNotes);
    await open(new FakePlatform(), drafts, { reloadNotes });
    act(() => root.unmount());
    root = createRoot(container);

    await open(new FakePlatform(), drafts, { reloadNotes });

    expect(session.restorable.map((entry) => entry.key)).toEqual(["/other.md"]);
  });
});

describe("the first unsaved work kept", () => {
  it("is announced, which is when the iOS Home Screen hint is due", async () => {
    vi.useFakeTimers();
    let written = 0;
    const { editor } = await open(new FakePlatform(), new DraftStore(memoryStore()), {
      reloadNotes: memoryStore(),
      onDraftWritten: () => written++,
    });

    await type(editor, "circle\n");
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });

    expect(written).toBe(1);
  });
});
