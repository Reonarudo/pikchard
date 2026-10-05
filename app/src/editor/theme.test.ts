import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentLanguage, languageExtension, languageForName } from "./language.js";
import { activeScriptTint } from "./theme.js";

const state = (doc: string, name: string, cursor = 0) =>
  EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [documentLanguage.of(languageExtension(languageForName(name))), activeScriptTint],
  });

/** Which lines the tint covers, by line number. */
function tinted(state: EditorState): number[] {
  const lines: number[] = [];
  state.field(activeScriptTint).between(0, state.doc.length, (from) => {
    lines.push(state.doc.lineAt(from).number);
  });
  return lines;
}

describe("the Active Script tint", () => {
  const doc = "# Title\n\n```pikchr\nbox\narrow\n```\n\n```pikchr\ncircle\n```\n";

  it("covers the body of the Active Script, and neither Fence line", () => {
    expect(tinted(state(doc, "notes.md", 20))).toEqual([4, 5]);
  });

  it("moves with the cursor", () => {
    expect(tinted(state(doc, "notes.md", 44))).toEqual([9]);
  });

  it("follows the cursor without an edit", () => {
    const before = state(doc, "notes.md", 20);
    const after = before.update({ selection: { anchor: 44 } }).state;

    expect(tinted(after)).toEqual([9]);
  });

  it("tints nothing in a Pikchr Document, where every line is the one Script", () => {
    expect(tinted(state("box\narrow\n", "diagram.pikchr"))).toEqual([]);
  });

  it("tints nothing when the Document has no Scripts", () => {
    expect(tinted(state("just prose\n", "notes.md"))).toEqual([]);
  });

  it("tints nothing for an empty Fence, which has no body line", () => {
    expect(tinted(state("```pikchr\n```\n", "notes.md", 10))).toEqual([]);
  });
});
