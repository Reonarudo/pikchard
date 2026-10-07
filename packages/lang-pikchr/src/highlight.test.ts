import { classHighlighter, highlightCode } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { BROKEN_FIXTURES, HAPPY_FIXTURES } from "./fixtures.js";
import { pikchrLanguage } from "./language.js";
import { errorSpans, parseScript } from "./tree.js";

// Highlighting has to stay stable while a Script is half-typed — that is the
// claim ADR 0007 rests on, so it is snapshotted rather than asserted by eye.
//
// The snapshot is the *colouring*, not the tree: each line becomes its tokens
// with the class each one was given. A grammar change that moves a node around
// without changing what the user sees leaves these files alone.

// Through `pikchrLanguage.parser`, not `parseScript`: the highlighting props
// are attached by `parser.configure`, so the bare parser produces the same
// tree with no colours on it.
function colour(text: string): string {
  const lines: string[] = [];
  let current = "";
  highlightCode(
    text,
    pikchrLanguage.parser.parse(text),
    classHighlighter,
    (token, classes) => {
      current += classes ? `[${classes.replace(/tok-/g, "")} ${token}]` : token;
    },
    () => {
      lines.push(current);
      current = "";
    },
  );
  lines.push(current);
  return lines.join("\n");
}

describe("every fixture", () => {
  it("says why it is worth a test, the way the corpus lists give reasons", () => {
    for (const { name, note } of [...HAPPY_FIXTURES, ...BROKEN_FIXTURES]) {
      expect(note.length, name).toBeGreaterThan(20);
    }
  });

  it("has a name of its own, so a failure names the case", () => {
    const names = [...HAPPY_FIXTURES, ...BROKEN_FIXTURES].map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe.each(HAPPY_FIXTURES)("$name", ({ text }) => {
  it("parses with no error nodes", () => {
    expect(errorSpans(parseScript(text))).toEqual([]);
    expect(colour(text)).toMatchSnapshot();
  });
});

describe.each(BROKEN_FIXTURES)("$name", ({ text }) => {
  it("keeps its colours despite the error", () => {
    expect(colour(text)).toMatchSnapshot();
  });
});

describe("a broken statement", () => {
  it("does not smear the colours of the statements after it", () => {
    const good = 'box "before"\nbox "after"';
    const broken = 'box "before"\ncircle wid wid wid at at\nbox "after"';

    const lastLineOf = (text: string) => colour(text).split("\n").at(-1);

    expect(lastLineOf(broken)).toBe(lastLineOf(good));
  });
});
