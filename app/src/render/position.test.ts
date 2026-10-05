import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { pikchr } from "@pikchard/lang-pikchr";
import type { RenderError } from "@pikchard/pikchr-wasm";
import { describe, expect, it } from "vitest";
import { projectScripts } from "../document/projection.js";
import { documentSpan, errorPosition, formatPosition } from "./position.js";

/** The projection of a Markdown Document with the cursor in a Fence. */
const project = (doc: string, cursor: number) =>
  projectScripts(
    EditorState.create({ doc, selection: { anchor: cursor }, extensions: [markdown()] }),
  );

/** A Render Error at a Script offset, as the renderer reports it. */
const at = (from: number, to = from + 1): RenderError => ({
  message: "syntax error",
  span: { from, to },
});

const doc = "# Title\n\nsome prose\n\n```pikchr\nbox\nboom circle\n```\n";
// The Fence body starts at offset 31, on line 6.
const cursor = 32;

describe("a Render Error's position", () => {
  it("is on the line of the file, not of the Fence", () => {
    const projection = project(doc, cursor);

    expect(projection.startLine).toBe(6);
    expect(errorPosition(projection, at(4))).toEqual({ line: 7, col: 1 });
    expect(formatPosition(errorPosition(projection, at(4)))).toBe("7:1");
  });

  it("counts columns from the start of the line", () => {
    expect(errorPosition(project(doc, cursor), at(9))).toEqual({ line: 7, col: 6 });
  });

  it("is the Script's own line and column in a Pikchr Document", () => {
    const projection = projectScripts(
      EditorState.create({ doc: "box\nboom\n", extensions: [pikchr()] }),
    );

    expect(errorPosition(projection, at(4))).toEqual({ line: 2, col: 1 });
  });

  it("keeps an indented Fence's own columns", () => {
    const indented = "- item\n\n  ```pikchr\n  boom\n  ```\n";
    const projection = project(indented, 22);

    expect(projection.text).toBe("  boom\n");
    expect(errorPosition(projection, at(2))).toEqual({ line: 4, col: 3 });
  });
});

describe("a Render Error's Document Span", () => {
  it("is the Script Span shifted by where the Script starts", () => {
    expect(documentSpan(project(doc, cursor), at(4, 8))).toEqual({ from: 35, to: 39 });
  });

  it("widens an empty Span, which would underline nothing", () => {
    expect(documentSpan(project(doc, cursor), at(0, 0))).toEqual({ from: 31, to: 32 });
  });

  it("underlines the Script's last character, never the Fence, at end of input", () => {
    const projection = project(doc, cursor);
    const end = projection.span?.to ?? 0;

    expect(documentSpan(projection, at(1000, 1004))).toEqual({ from: end - 1, to: end });
  });

  it("is nothing at all when the Document has no Scripts", () => {
    expect(documentSpan(project("just prose\n", 0), at(0))).toBeNull();
  });
});
