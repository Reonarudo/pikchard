import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { pikchr } from "@pikchard/lang-pikchr";
import { describe, expect, it } from "vitest";
import { NO_SCRIPTS, projectScripts, sameProjection } from "./projection.js";

const md = (doc: string, cursor = 0) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: [markdown()] });

const pik = (doc: string) => EditorState.create({ doc, extensions: [pikchr()] });

const doc = "# Title\n\n```pikchr\nbox\n```\n\n```pikchr\ncircle\n```\n";

describe("the projection", () => {
  it("carries the count, the index, the Span, the text and the starting line", () => {
    expect(projectScripts(md(doc, 20))).toEqual({
      count: 2,
      activeIndex: 0,
      span: { from: 19, to: 23 },
      text: "box\n",
      startLine: 4,
    });
  });

  it("counts the starting line of a later Fence in the Document, not in the Fence", () => {
    expect(projectScripts(md(doc, 40)).startLine).toBe(8);
  });

  it("starts a Pikchr Document's one Script on line 1", () => {
    expect(projectScripts(pik("box\n")).startLine).toBe(1);
  });

  it("says so when a Document has no Scripts", () => {
    expect(projectScripts(md("just prose\n"))).toEqual(NO_SCRIPTS);
  });

  it("still counts the Scripts of a Document whose cursor is in the prose", () => {
    expect(projectScripts(md(doc, 3)).count).toBe(2);
    expect(projectScripts(md(doc, 3)).activeIndex).toBe(0);
  });
});

describe("comparing two projections", () => {
  it("sees a moved Span as a change, even when the text is identical", () => {
    const before = projectScripts(md(doc, 20));
    const shifted = projectScripts(md(`more prose\n\n${doc}`, 32));

    expect(shifted.text).toBe(before.text);
    expect(sameProjection(before, shifted)).toBe(false);
  });

  it("sees an unchanged projection as unchanged", () => {
    expect(sameProjection(projectScripts(md(doc, 20)), projectScripts(md(doc, 21)))).toBe(true);
  });

  it("sees a different Active Script as a change", () => {
    expect(sameProjection(projectScripts(md(doc, 20)), projectScripts(md(doc, 40)))).toBe(false);
  });
});
