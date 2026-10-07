import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor, type EditorDocument } from "../editor/Editor.js";
import { fidelityExtension, readDocument } from "../editor/fidelity.js";
import { FakePlatform } from "../platform/fake.js";
import { DocumentUnreadableError, type OpenedDocument, opening } from "../platform/types.js";
import { UNTITLED } from "../store.js";
import { type SaveTarget, saveDocument, saveDocumentAs } from "./save.js";

/** The editor state a Document opens into — the line ending included. */
function stateFor(document: EditorDocument): EditorState {
  return EditorState.create({
    doc: document.fidelity.text,
    extensions: [fidelityExtension(document.fidelity)],
  });
}

const target = (text: string, identity: SaveTarget["identity"] = null): SaveTarget => ({
  name: "notes.md",
  fidelity: readDocument(text),
  identity,
  // The Document is at its Baseline until a test edits it: opened, not touched.
  baseline: readDocument(text).text,
});

/** Prompt B, never expected to be asked. */
const neverAsked = async () => {
  throw new Error("the file matched its Baseline: nothing to confirm");
};

/** Prompt B, and what the user answered. */
function asked(answer: boolean) {
  const names: string[] = [];
  return {
    names,
    confirm: async (name: string) => {
      names.push(name);
      return answer;
    },
  };
}

describe("Save", () => {
  it("writes back through the Identity, with the Document's own bytes", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "﻿box\r\n");
    const document = target("﻿box\r\n", identity);

    const result = await saveDocument(platform, document, stateFor(document), neverAsked);

    // The Baseline the Document now has is the text, BOM and all its own
    // line endings stripped back out of it.
    expect(result).toEqual({ outcome: "saved", identity, text: "box\r\n" });
    // The BOM is re-emitted and the CRLF preserved: what came off the file.
    expect(platform.saved).toEqual([{ key: "/notes.md", text: "﻿box\r\n" }]);
  });

  it("asks where to save an Untitled Document, and takes the Identity back", async () => {
    const platform = new FakePlatform();
    const identity = { key: "/chosen.md", name: "chosen.md" };
    platform.nextSaveAs = { outcome: "saved", identity };
    const document = target("box\n");

    const result = await saveDocument(platform, document, stateFor(document), neverAsked);

    expect(result).toEqual({ outcome: "saved", identity, text: "box\n" });
    expect(platform.saved).toEqual([{ key: "/chosen.md", text: "box\n" }]);
  });

  it("suggests a Name a file can actually have for an Untitled Document", async () => {
    const platform = new FakePlatform();
    platform.nextSaveAs = { outcome: "cancelled" };
    const untitled: SaveTarget = { ...target("box\n"), name: UNTITLED };

    await saveDocument(platform, untitled, stateFor(untitled), neverAsked);

    // "Untitled" with no extension would come back as a Pikchr Document by
    // accident on the download path, where the user never sees a dialog.
    expect(platform.saveAsPrompts).toEqual([`${UNTITLED}.pikchr`]);
  });

  it("suggests the Document's own Name when it has one", async () => {
    const platform = new FakePlatform();
    platform.nextSaveAs = { outcome: "cancelled" };
    const document = target("box\n");

    await saveDocument(platform, document, stateFor(document), neverAsked);

    expect(platform.saveAsPrompts).toEqual(["notes.md"]);
  });

  it("writes nothing when the user cancels the dialog", async () => {
    const platform = new FakePlatform();
    platform.nextSaveAs = { outcome: "cancelled" };
    const document = target("box\n");

    expect(await saveDocument(platform, document, stateFor(document), neverAsked)).toEqual({
      outcome: "cancelled",
    });
    expect(platform.saved).toEqual([]);
  });

  it("downloads where the Platform cannot write back to the file it opened", async () => {
    // Firefox and Safari: the Identity is there for the title and nothing else,
    // so even a known Document can only go to the downloads folder (#1054).
    const platform = new FakePlatform({ capabilities: { saveInPlace: false } });
    platform.nextSaveAs = { outcome: "downloaded" };
    const document = target("box\n", { key: "/notes.md", name: "notes.md" });

    expect(await saveDocument(platform, document, stateFor(document), neverAsked)).toEqual({
      outcome: "downloaded",
    });
  });

  it("saves what the editor holds now, not the bytes it was opened from", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");
    const document = target("box\n", identity);
    const edited = stateFor(document).update({
      changes: { from: 0, to: 3, insert: "circle" },
    }).state;

    await saveDocument(platform, document, edited, neverAsked);

    expect(platform.saved).toEqual([{ key: "/notes.md", text: "circle\n" }]);
  });
});

/**
 * The file changed underneath (Prompt B).
 *
 * Pikchard does not watch files while they are open, so reading the file back
 * at Save is the whole defence against overwriting an edit it never saw —
 * which is why it is the same check on both Platforms (#1054).
 */
describe("Save, when the file no longer matches the Baseline", () => {
  it("asks before overwriting, and writes when the user says to", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "someone else\n");
    const document = target("box\n", identity);
    const prompt = asked(true);

    const result = await saveDocument(platform, document, stateFor(document), prompt.confirm);

    expect(prompt.names).toEqual(["notes.md"]);
    expect(result).toEqual({ outcome: "saved", identity, text: "box\n" });
    expect(platform.saved).toEqual([{ key: "/notes.md", text: "box\n" }]);
  });

  it("writes nothing when the user cancels", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "someone else\n");
    const document = target("box\n", identity);

    const result = await saveDocument(platform, document, stateFor(document), asked(false).confirm);

    expect(result).toEqual({ outcome: "cancelled" });
    expect(platform.saved).toEqual([]);
  });

  it("counts a line ending someone else changed as a change", async () => {
    // Compared as bytes, not as text: a file rewritten as CRLF holds the same
    // words, and is still not the file Pikchard was holding.
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\r\n");
    const document = { ...target("box\n", identity), baseline: "box\n" };
    const prompt = asked(false);

    await saveDocument(platform, document, stateFor(document), prompt.confirm);

    expect(prompt.names).toEqual(["notes.md"]);
  });

  it("compares the Baseline and not what the editor now holds", async () => {
    // The ordinary Save of an edited Document: the file still says what it said
    // when it was opened, so there is nothing to ask about.
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");
    const document = target("box\n", identity);
    const edited = stateFor(document).update({
      changes: { from: 0, to: 3, insert: "circle" },
    }).state;

    await saveDocument(platform, document, edited, neverAsked);

    expect(platform.saved).toEqual([{ key: "/notes.md", text: "circle\n" }]);
  });

  it("asks where to put a Document whose file has been deleted", async () => {
    // Nothing to overwrite, so nothing to ask about — but also nowhere to write
    // back to, so the Document needs a destination.
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");
    platform.breakFile("/notes.md", "missing");
    platform.nextSaveAs = { outcome: "saved", identity: { key: "/again.md", name: "again.md" } };
    const document = target("box\n", identity);

    const result = await saveDocument(platform, document, stateFor(document), neverAsked);

    expect(result).toEqual({
      outcome: "saved",
      identity: { key: "/again.md", name: "again.md" },
      text: "box\n",
    });
  });

  it("lets a denial reach the caller rather than asking about a file it cannot read", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");
    platform.breakFile("/notes.md", "denied");
    const document = target("box\n", identity);

    await expect(saveDocument(platform, document, stateFor(document), neverAsked)).rejects.toThrow(
      DocumentUnreadableError,
    );
    expect(platform.saved).toEqual([]);
  });
});

describe("Save As", () => {
  it("asks where to put a Document that already has a home", async () => {
    const platform = new FakePlatform();
    const known = platform.addFile("/notes.md", "notes.md", "box\n");
    const chosen = { key: "/copy.md", name: "copy.md" };
    platform.nextSaveAs = { outcome: "saved", identity: chosen };
    const document = target("box\n", known);

    const result = await saveDocumentAs(platform, document, stateFor(document));

    expect(result).toEqual({ outcome: "saved", identity: chosen, text: "box\n" });
    // The Document it was saved *from* is left exactly as it was.
    expect(platform.saved).toEqual([{ key: "/copy.md", text: "box\n" }]);
  });

  it("never asks about overwriting — that dialog is the Platform's own", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "someone else\n");
    platform.nextSaveAs = { outcome: "saved", identity };
    const document = target("box\n", identity);

    expect(await saveDocumentAs(platform, document, stateFor(document))).toEqual({
      outcome: "saved",
      identity,
      text: "box\n",
    });
  });

  it("reports a download without a Baseline to move to", async () => {
    // Pikchard never learns where the file went, so the Document stays exactly
    // as Unsaved as it was (#1054).
    const platform = new FakePlatform({ capabilities: { saveInPlace: false } });
    platform.nextSaveAs = { outcome: "downloaded" };
    const document = target("box\n");

    expect(await saveDocumentAs(platform, document, stateFor(document))).toEqual({
      outcome: "downloaded",
    });
  });
});

/**
 * #1085's first acceptance criterion, end to end: the Document comes off the
 * Platform, through the real editor, and back to the Platform — and the only
 * thing that moved is the Script that was edited.
 *
 * The seam's own round trip is covered in `fidelity.test.ts`; what this adds is
 * that the app actually walks it.
 */
describe("a Document opened, edited and saved", () => {
  const raw =
    "﻿# Notes\r\n\r\n```pikchr\r\nbox\r\n```\r\n\r\nprose\r\n\r\n```pikchr\r\ncircle\r\n```";

  let container: HTMLDivElement;
  let root: Root;
  let view: EditorView | null = null;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    view = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("writes back a CRLF Document with a BOM and no trailing newline, diffed only in that Script", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", raw);
    platform.nextOpen = opening({ name: "notes.md", text: raw, identity });

    const delivery = await platform.openDocument();
    const opened = (delivery as { opened: OpenedDocument }).opened;
    const document: EditorDocument = { name: opened.name, fidelity: readDocument(opened.text) };

    act(() => {
      root.render(
        <Editor
          document={document}
          onScripts={() => {}}
          onView={(mounted) => {
            view = mounted;
          }}
        />,
      );
    });
    const editor = view as unknown as EditorView;

    // Edit the second Script, through the editor rather than around it.
    const at = editor.state.doc.toString().indexOf("circle");
    act(() => {
      editor.dispatch({ changes: { from: at, to: at + "circle".length, insert: "ellipse" } });
    });

    await saveDocument(
      platform,
      { name: opened.name, fidelity: document.fidelity, identity, baseline: raw.slice(1) },
      editor.state,
      neverAsked,
    );

    const written = await platform.readDocument(identity);
    expect(written).toBe(raw.replace("circle", "ellipse"));
    // Said again as the criterion says it: every other line is untouched.
    expect(written.split("\r\n")).toEqual(
      raw.split("\r\n").map((line) => (line === "circle" ? "ellipse" : line)),
    );
  });
});
