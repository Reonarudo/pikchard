import { insertNewlineAndIndent, toggleComment } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScriptProjection } from "../document/projection.js";
import type { EditorDiagnostic } from "./diagnostics.js";
import { Editor, type EditorDocument } from "./Editor.js";
import { readDocument } from "./fidelity.js";

const doc = (name: string, text: string): EditorDocument => ({
  name,
  fidelity: readDocument(text),
});

/** The Render Error the Editor is showing, as the lint extension holds it. */
function underlined(): { from: number; to: number; message: string }[] {
  const found: { from: number; to: number; message: string }[] = [];
  forEachDiagnostic(mounted().state, (diagnostic, from, to) => {
    found.push({ from, to, message: diagnostic.message });
  });
  return found;
}

let container: HTMLDivElement;
let root: Root;
let view: EditorView | null = null;
let published: ScriptProjection[] = [];

/** Mount the Editor on a Document and return the last projection. */
function mount(document: EditorDocument, diagnostic: EditorDiagnostic | null = null) {
  act(() => {
    root.render(
      <Editor
        document={document}
        diagnostic={diagnostic}
        onScripts={(projection) => published.push(projection)}
        onView={(created) => {
          view = created;
        }}
      />,
    );
  });
}

/** The projection the Editor published most recently. */
function latest(): ScriptProjection {
  const projection = published[published.length - 1];
  if (!projection) throw new Error("the Editor published no projection");
  return projection;
}

/**
 * Press Backspace, as a key rather than as a command — which of the two
 * bindings for it runs is the thing under test.
 */
function backspace(view: EditorView) {
  view.contentDOM.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Backspace", keyCode: 8, bubbles: true }),
  );
}

/** The mounted view. Failing loudly here beats a null check in every test. */
function mounted(): EditorView {
  if (!view) throw new Error("the Editor is not mounted");
  return view;
}

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  published = [];
  view = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the Editor", () => {
  it("mounts one CodeMirror over the Document", () => {
    mount(doc("notes.md", "# Title\n\n```pikchr\nbox\n```\n"));

    expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(mounted().state.doc.toString()).toBe("# Title\n\n```pikchr\nbox\n```\n");
  });

  it("announces the Scripts of the Document it opened on", () => {
    mount(doc("notes.md", "# Title\n\n```pikchr\nbox\n```\n"));

    expect(latest()).toEqual({
      count: 1,
      activeIndex: 0,
      span: { from: 19, to: 23 },
      text: "box\n",
      startLine: 4,
    });
  });

  it("republishes as the Document is edited", () => {
    mount(doc("notes.md", "# Title\n\n```pikchr\nbox\n```\n"));

    act(() => {
      mounted().dispatch({ changes: { from: 19, to: 22, insert: "circle" } });
    });

    expect(latest().text).toBe("circle\n");
  });

  it("republishes as the cursor crosses into another Script", () => {
    mount(doc("notes.md", "```pikchr\nbox\n```\n\n```pikchr\ncircle\n```\n"));
    expect(latest().activeIndex).toBe(0);

    act(() => {
      mounted().dispatch({ selection: { anchor: 30 } });
    });

    expect(latest().activeIndex).toBe(1);
    expect(latest().text).toBe("circle\n");
  });

  it("says a prose-only Document has no Scripts", () => {
    mount(doc("notes.md", "# Title\n\njust prose\n"));

    expect(latest()).toEqual({
      count: 0,
      activeIndex: null,
      span: null,
      text: "",
      startLine: 0,
    });
  });

  it("treats a .pikchr Document as one Script over the whole file", () => {
    mount(doc("diagram.pikchr", "box\narrow\n"));

    expect(latest()).toEqual({
      count: 1,
      activeIndex: 0,
      span: { from: 0, to: 10 },
      text: "box\narrow\n",
      startLine: 1,
    });
  });

  it("keeps one editor across Save As, and re-derives the Scripts", () => {
    // The acceptance criterion: Save As from .pikchr to .md leaves one
    // editor, now with the Markdown language, its Scripts re-derived.
    const text = "```pikchr\nbox\n```\n";
    mount(doc("diagram.pikchr", text));
    const first = view;
    expect(latest().text).toBe(text);

    mount(doc("diagram.md", text));

    expect(view).toBe(first);
    expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(latest().text).toBe("box\n");
  });

  it("swaps a newly opened Document into the same editor", () => {
    mount(doc("diagram.pikchr", "box\n"));
    const first = view;

    mount(doc("notes.md", "# Other\n\n```pikchr\ncircle\n```\n"));

    expect(view).toBe(first);
    expect(mounted().state.doc.toString()).toBe("# Other\n\n```pikchr\ncircle\n```\n");
    expect(latest().text).toBe("circle\n");
  });

  it("underlines the Render Error at its line of the file", () => {
    const md = "# Title\n\n```pikchr\nbox\nbax\n```\n";

    // The second body line starts at 23, which is line 5 of the *file*.
    mount(doc("notes.md", md), { span: { from: 23, to: 26 }, message: 'unknown "bax"' });

    expect(underlined()).toEqual([{ from: 23, to: 26, message: 'unknown "bax"' }]);
    expect(mounted().state.doc.lineAt(23).number).toBe(5);
  });

  it("takes the underline away once the Render succeeds", () => {
    const md = "```pikchr\nbax\n```\n";
    mount(doc("notes.md", md), { span: { from: 10, to: 13 }, message: 'unknown "bax"' });
    expect(underlined()).toHaveLength(1);

    mount(doc("notes.md", md), null);

    expect(underlined()).toEqual([]);
  });

  // The three below are #1015's editing criteria as the assembled editor has
  // them. `brackets.test.ts` owns auto-close and matching on their own; what
  // is worth asserting here is that the keymaps agree with each other.

  it("takes both halves of a bracket pair on Backspace, ahead of the plain one", () => {
    mount(doc("diagram.pikchr", "()"));
    mounted().dispatch({ selection: { anchor: 1 } });
    backspace(mounted());

    expect(mounted().state.doc.toString()).toBe("");
  });

  it("indents a line opened inside a Sublist", () => {
    mount(doc("diagram.pikchr", "[]"));
    mounted().dispatch({ selection: { anchor: 1 } });
    insertNewlineAndIndent(mounted());

    expect(mounted().state.doc.toString()).toBe("[\n  \n]");
  });

  it("toggles a comment with Pikchr's own `#`, even inside a Markdown Fence", () => {
    mount(doc("notes.md", "# Title\n\n```pikchr\nbox\n```\n"));
    mounted().dispatch({ selection: { anchor: 19 } });
    toggleComment(mounted());

    expect(mounted().state.doc.toString()).toBe("# Title\n\n```pikchr\n# box\n```\n");
  });

  it("opens a CRLF Document on its own line ending", () => {
    mount(doc("notes.md", "a\r\nb\r\n"));

    expect(mounted().state.doc.lines).toBe(3);
    expect(mounted().state.doc.sliceString(0, mounted().state.doc.length, "\r\n")).toBe(
      "a\r\nb\r\n",
    );
  });
});
