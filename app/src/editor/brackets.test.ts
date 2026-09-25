import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { bracketEditing } from "./brackets.js";
import { documentLanguage, languageExtension, languageForName } from "./language.js";

const opened: EditorView[] = [];

/** A view on a Document, because typing is something only a view can do. */
function open(doc: string, name: string, cursor = 0): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [documentLanguage.of(languageExtension(languageForName(name))), bracketEditing],
    }),
  });
  opened.push(view);
  return view;
}

// A view left alive measures itself on the next animation frame, which jsdom
// cannot do — so every view is torn down with the test that opened it.
afterEach(() => {
  for (const view of opened.splice(0)) view.destroy();
});

/**
 * Type one character into the view, the way the browser delivers it.
 *
 * Through the input handlers rather than by dispatching the insertion: the
 * handler is `closeBrackets`' whole contribution, so a test that inserted the
 * character itself would pass with the extension left out.
 */
function type(view: EditorView, text: string): string {
  const { head } = view.state.selection.main;
  const handled = view.state
    .facet(EditorView.inputHandler)
    .some((handler) => handler(view, head, head, text, () => view.state.update({})));
  if (!handled)
    view.dispatch({
      changes: { from: head, insert: text },
      selection: { anchor: head + text.length },
    });
  return view.state.doc.toString();
}

/** Where the cursor ended up. */
const cursor = (view: EditorView) => view.state.selection.main.head;

describe("auto-close", () => {
  it("closes a `(` around the cursor", () => {
    const view = open("", "diagram.pikchr");

    expect(type(view, "(")).toBe("()");
    expect(cursor(view)).toBe(1);
  });

  it("closes a `[`, which is how a Script nests a Sublist", () => {
    expect(type(open("", "diagram.pikchr"), "[")).toBe("[]");
  });

  it('closes a `"`, so a string label is never left open', () => {
    expect(type(open("box ", "diagram.pikchr", 4), '"')).toBe('box ""');
  });

  it("closes a `{`, which is how a Macro body is written", () => {
    expect(type(open("define f ", "diagram.pikchr", 9), "{")).toBe("define f {}");
  });

  it("types over the close it inserted rather than doubling it", () => {
    const view = open("", "diagram.pikchr");
    type(view, "(");

    expect(type(view, ")")).toBe("()");
    expect(cursor(view)).toBe(2);
  });

  it("closes inside a Markdown Fence, where Pikchr is the language at the cursor", () => {
    const view = open("# Title\n\n```pikchr\nbox \n```\n", "notes.md", 23);

    expect(type(view, '"')).toBe('# Title\n\n```pikchr\nbox ""\n```\n');
    expect(cursor(view)).toBe(24);
  });
});

describe("bracket matching", () => {
  /** How many brackets the view highlights as a matched pair. */
  function matched(doc: string, name: string, at: number): number {
    const view = open(doc, name, at);
    // The mark is on the brackets whether or not the editor has focus; the
    // theme is what paints it only while focused.
    const count = view.dom.querySelectorAll(".cm-matchingBracket").length;
    view.destroy();
    return count;
  }

  it("highlights both ends of a Sublist's brackets", () => {
    expect(matched("[\nbox\n]\n", "diagram.pikchr", 0)).toBe(2);
  });

  it("highlights nothing beside a bracket with no partner", () => {
    expect(matched("[\nbox\n", "diagram.pikchr", 0)).toBe(0);
  });
});
