import { EditorState, type StateCommand, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { scriptsOf } from "../document/scripts.js";
import { canInsertFence, insertFence } from "./commands.js";
import { documentLanguage, languageExtension, languageForName } from "./language.js";

const state = (doc: string, name: string, cursor = 0) =>
  EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [documentLanguage.of(languageExtension(languageForName(name)))],
  });

/** Run a `StateCommand` off-view, returning the state it produced. */
function run(command: StateCommand, from: EditorState): EditorState | null {
  let produced: EditorState | null = null;
  const handled = command({
    state: from,
    dispatch: (transaction: Transaction) => {
      produced = transaction.state;
    },
  });
  return handled ? produced : null;
}

describe("Insert Pikchr Fence", () => {
  it("is offered in a Markdown Document and refused in a Pikchr one", () => {
    expect(canInsertFence(state("", "notes.md"))).toBe(true);
    expect(canInsertFence(state("", "diagram.pikchr"))).toBe(false);
    expect(canInsertFence(state("", "Untitled"))).toBe(false);
  });

  it("does nothing at all in a Pikchr Document", () => {
    const before = state("box\n", "diagram.pikchr");

    expect(run(insertFence, before)).toBe(null);
  });

  it("inserts a Fence the Script list immediately counts", () => {
    const before = state("# Title\n", "notes.md", 8);

    const after = run(insertFence, before);

    expect(after).not.toBe(null);
    expect(scriptsOf(after as EditorState)).toHaveLength(1);
  });

  it("leaves the cursor inside the new Fence, on its own empty line", () => {
    const before = state("# Title\n", "notes.md", 8);

    const after = run(insertFence, before) as EditorState;

    const script = scriptsOf(after)[0];
    expect(after.selection.main.head).toBe(script?.span.from);
    expect(after.selection.main.empty).toBe(true);
    expect(after.doc.lineAt(after.selection.main.head).text).toBe("");
  });

  it("puts the Fence on its own lines when the cursor is mid-line", () => {
    const before = state("prose here\n", "notes.md", 5);

    const after = run(insertFence, before) as EditorState;

    expect(after.doc.toString()).toBe("prose\n\n```pikchr\n\n```\n\n here\n");
    expect(scriptsOf(after)).toHaveLength(1);
  });

  it("does not pile blank lines onto an empty Document", () => {
    const after = run(insertFence, state("", "notes.md")) as EditorState;

    expect(after.doc.toString()).toBe("```pikchr\n\n```\n");
  });

  it("separates the new Fence from the Fence above it", () => {
    const doc = "```pikchr\nbox\n```\n";
    const after = run(insertFence, state(doc, "notes.md", doc.length)) as EditorState;

    expect(after.doc.toString()).toBe("```pikchr\nbox\n```\n\n```pikchr\n\n```\n");
    expect(scriptsOf(after)).toHaveLength(2);
  });

  it("writes the Fence with the Document's own line ending", () => {
    const before = EditorState.create({
      doc: "# Title\r\n",
      // The CRLF break is one position, so the Document ends at 8.
      selection: { anchor: 8 },
      extensions: [
        EditorState.lineSeparator.of("\r\n"),
        documentLanguage.of(languageExtension("markdown")),
      ],
    });

    const after = run(insertFence, before) as EditorState;

    expect(after.doc.sliceString(0, after.doc.length, "\r\n")).toBe(
      "# Title\r\n\r\n```pikchr\r\n\r\n```\r\n",
    );
  });
});
