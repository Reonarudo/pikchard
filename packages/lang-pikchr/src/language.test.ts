import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { pikchr, pikchrLanguage } from "./language.js";

const stateWith = (doc: string) => EditorState.create({ doc, extensions: [pikchr()] });

describe("the language", () => {
  it("is installed by `pikchr()` as the editor's language", () => {
    const state = stateWith('box "hello"');

    expect(pikchrLanguage.isActiveAt(state, 0)).toBe(true);
  });

  it("comments with `#`, which is what Pikchr's own documentation uses", () => {
    const state = stateWith("box");

    expect(state.languageDataAt<{ line: string }>("commentTokens", 0)[0]?.line).toBe("#");
  });

  it("knows the block comment Pikchr also accepts", () => {
    const state = stateWith("box");
    const tokens = state.languageDataAt<{ block: { open: string; close: string } }>(
      "commentTokens",
      0,
    )[0];

    expect(tokens?.block).toEqual({ open: "/*", close: "*/" });
  });

  it("closes the brackets a Script actually nests", () => {
    const state = stateWith("box");

    expect(state.languageDataAt<{ brackets: string[] }>("closeBrackets", 0)[0]?.brackets).toEqual([
      "(",
      "[",
      "{",
      '"',
    ]);
  });

  it("parses through the editor, not only through `parseScript`", () => {
    const state = stateWith('A: box "hello"');
    const tree = pikchrLanguage.parser.parse(state.doc.toString());

    expect(tree.topNode.name).toBe("Script");
    expect(tree.length).toBe(state.doc.length);
  });
});
