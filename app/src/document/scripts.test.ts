import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { pikchr } from "@pikchard/lang-pikchr";
import { describe, expect, it } from "vitest";
import { activeScript, activeScriptIndex, scriptsOf } from "./scripts.js";

/** A Markdown Document, as the editor over a `.md` file has it. */
const md = (doc: string, cursor = 0) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: [markdown()] });

/** A `.pikchr` Document: the whole file is one Script. */
const pik = (doc: string, cursor = 0) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: [pikchr()] });

/** What each Script actually covers, as `[span, text]`, for readable failures. */
const spans = (state: EditorState) =>
  scriptsOf(state).map((script) => [script.span.from, script.span.to, script.text] as const);

describe("the Script list of a Markdown Document", () => {
  it("is empty when the Document has no Fences at all", () => {
    expect(spans(md("just prose\n\nand more prose\n"))).toEqual([]);
  });

  it("is empty when the only Fences are some other language", () => {
    expect(spans(md("```js\nnope\n```\n"))).toEqual([]);
  });

  it("finds the one Fence of a one-Script Document", () => {
    expect(spans(md("intro\n\n```pikchr\nbox\n```\n"))).toEqual([[17, 21, "box\n"]]);
  });

  it("finds every Fence, in Document order", () => {
    const doc = "```pikchr\nbox\n```\n\ntext\n\n```pikchr\ncircle\n```\n";

    expect(spans(md(doc))).toEqual([
      [10, 14, "box\n"],
      [35, 42, "circle\n"],
    ]);
  });

  it("keeps a Script indented inside a list contiguous, indentation and all", () => {
    // The Markdown tree de-indents the Fence body for the nested parse; a
    // Script must not be de-indented, so `span.from + offset` stays a
    // Document offset (ADR 0008).
    const doc = "- item\n\n  ```pikchr\n  circle\n  ```\n";

    expect(spans(md(doc))).toEqual([[20, 29, "  circle\n"]]);
  });

  it("takes an unclosed Fence at EOF to the end of the Document", () => {
    expect(spans(md("```pikchr\nbox\narrow"))).toEqual([[10, 19, "box\narrow"]]);
  });

  it("gives an empty Fence an empty Script rather than dropping it", () => {
    expect(spans(md("```pikchr\n```\n"))).toEqual([[10, 10, ""]]);
  });

  it("reads a ~~~ Fence, and leaves a ``` Fence inside it alone", () => {
    const doc = "~~~pikchr\nbox\n```\ncircle\n~~~\n";

    expect(spans(md(doc))).toEqual([[10, 25, "box\n```\ncircle\n"]]);
  });

  it("reads a ``` Fence, and leaves a ~~~ Fence inside it alone", () => {
    const doc = "```pikchr\nbox\n~~~\ncircle\n```\n";

    expect(spans(md(doc))).toEqual([[10, 25, "box\n~~~\ncircle\n"]]);
  });

  it("rejects an info string that only starts with pikchr, and accepts a decorated one", () => {
    const doc = "```pikchrx\nno\n```\n\n```Pikchr {x}\nyes\n```\n";

    expect(spans(md(doc))).toEqual([[33, 37, "yes\n"]]);
  });
});

describe("the Script list of a Document larger than the viewport", () => {
  // CodeMirror parses lazily, to the viewport and a little past it. A Script
  // count that depended on the scroll position would be a lie, so the parse
  // is forced to the end of the Document.
  const many = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => `para ${i}\n\n\`\`\`pikchr\nbox "${i}"\n\`\`\`\n\n`,
    ).join("");

  it("finds every Script, far past where lazy parsing would have stopped", () => {
    const doc = many(400);
    expect(doc.length).toBeGreaterThan(10_000);

    const found = scriptsOf(md(doc));

    expect(found).toHaveLength(400);
    expect(found[399]?.text).toBe('box "399"\n');
  });

  it("puts the Active Script at the cursor, not at the last one it parsed", () => {
    const doc = many(400);
    const last = doc.lastIndexOf('box "399"');

    expect(activeScriptIndex(md(doc, last))).toBe(399);
  });
});

describe("the Script list of a .pikchr Document", () => {
  it("is the whole Document, as one Script", () => {
    expect(spans(pik("box\narrow\n"))).toEqual([[0, 10, "box\narrow\n"]]);
  });

  it("is one empty Script for an empty Document, not no Scripts", () => {
    expect(spans(pik(""))).toEqual([[0, 0, ""]]);
  });

  it("never reads a Fence — ``` is Pikchr text here, not Markdown", () => {
    expect(spans(pik("```pikchr\nbox\n```\n"))).toEqual([[0, 18, "```pikchr\nbox\n```\n"]]);
  });
});

describe("the Active Script", () => {
  const doc = "```pikchr\nbox\n```\n\ntext\n\n```pikchr\ncircle\n```\n";
  //           0         10     17    19        25        35       42

  it("is the Script the cursor is in", () => {
    expect(activeScriptIndex(md(doc, 11))).toBe(0);
    expect(activeScriptIndex(md(doc, 36))).toBe(1);
  });

  it("includes both ends of the Span, so a cursor at a Script's edge is inside it", () => {
    expect(activeScriptIndex(md(doc, 10))).toBe(0);
    expect(activeScriptIndex(md(doc, 14))).toBe(0);
  });

  it("is the nearest Script before the cursor when the cursor is in the prose", () => {
    expect(activeScriptIndex(md(doc, 21))).toBe(0);
    expect(activeScriptIndex(md(doc, doc.length))).toBe(1);
  });

  it("is the first Script when the cursor is before every Script", () => {
    expect(activeScriptIndex(md(`intro\n\n${doc}`, 2))).toBe(0);
  });

  it("is nothing at all when the Document has no Scripts", () => {
    expect(activeScriptIndex(md("just prose\n"))).toBe(null);
    expect(activeScript(md("just prose\n"))).toBe(null);
  });

  it("carries the text the renderer needs", () => {
    expect(activeScript(md(doc, 36))?.text).toBe("circle\n");
  });
});

describe("the Active Script across an edit", () => {
  // Identity is positional: a Script is never tracked by index across an
  // edit, so these cases are about landing somewhere sane, never about
  // remembering which Script used to be active.
  const doc = "```pikchr\nbox\n```\n\n```pikchr\ncircle\n```\n";

  it("falls back to the preceding Script when its own Fence is deleted", () => {
    const state = md(doc, 30);
    const fenceTwo = { from: 19, to: doc.length };
    const after = state.update({ changes: { ...fenceTwo, insert: "" } }).state;

    expect(scriptsOf(after)).toHaveLength(1);
    expect(activeScriptIndex(after)).toBe(0);
  });

  it("falls back when its Fence stops being Pikchr rather than being deleted", () => {
    const state = md(doc, 30);
    // `pikchr` → `pikchrx` in the second Fence's info string.
    const after = state.update({ changes: { from: 25, to: 25, insert: "x" } }).state;

    expect(scriptsOf(after)).toHaveLength(1);
    expect(activeScriptIndex(after)).toBe(0);
  });

  it("has no Active Script, and does not throw, once the Document is empty", () => {
    const state = md(doc, 30);
    const after = state.update({ changes: { from: 0, to: doc.length, insert: "" } }).state;

    expect(scriptsOf(after)).toEqual([]);
    expect(activeScriptIndex(after)).toBe(null);
  });
});

describe("mapping a Script offset back to its Document", () => {
  it("lands a Render Error on the right Document line, Fence indented or not", () => {
    // A Render Error on line 5 of Script 3 — the acceptance criterion, with
    // Script 3 in a Fence indented inside a list.
    const prose = "# Doc\n\n";
    const fence = (body: string) => `\`\`\`pikchr\n${body}\`\`\`\n\n`;
    const indent = (body: string) =>
      body
        .split("\n")
        .map((line) => (line === "" ? "" : `  ${line}`))
        .join("\n");
    const indented = (body: string) => `- item\n\n  \`\`\`pikchr\n${indent(body)}  \`\`\`\n`;
    const five = "box\ncircle\narrow\nbox\nOOPS\n";
    const doc = prose + fence("box\n") + fence("circle\n") + indented(five);
    const state = md(doc, doc.length - 1);

    const script = activeScript(state);
    expect(scriptsOf(state)).toHaveLength(3);
    expect(script?.text.split("\n")[4]).toBe("  OOPS");

    // pikchr reports the error at an offset within the Script; the Document
    // offset is `span.from + offset`, with no line table in between.
    const scriptOffset = script?.text.indexOf("OOPS") ?? -1;
    const documentOffset = (script?.span.from ?? 0) + scriptOffset;
    expect(state.doc.sliceString(documentOffset, documentOffset + 4)).toBe("OOPS");
    expect(state.doc.lineAt(documentOffset).number).toBe(state.doc.lines - 2);
  });
});
