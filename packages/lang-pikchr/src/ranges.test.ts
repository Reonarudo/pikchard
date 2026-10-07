import { describe, expect, it } from "vitest";
import { parser } from "../parser/pikchr.js";
import { errorSpans, type Span } from "./tree.js";

// A Script inside an *indented* Fence — one in a list item, say — never
// reaches this parser as a single string. `@lezer/markdown` strips the
// indentation and hands us the line contents as several ranges with gaps
// between them (ADR 0008), so anything that reads raw input outside the token
// being scanned can meet a gap. Three things here do: the backwards peek that
// enforces `pill(` with no space, the forward scan over a Macro argument list,
// and the one-word lookahead behind the four `.` tokens.
//
// The rendering path is unaffected — a Script is handed to pikchr verbatim,
// indentation included.

/**
 * The ranges `@lezer/markdown` would hand us for a Script indented by `indent`
 * spaces inside a Markdown Document: one per line, skipping the indentation.
 */
function indentedFence(script: string, indent: number): { doc: string; ranges: Span[] } {
  const pad = " ".repeat(indent);
  const lines = script.split("\n");
  const doc = `${lines.map((line) => pad + line).join("\n")}\n`;
  const ranges: Span[] = [];
  let at = 0;
  for (const line of lines) {
    at += indent;
    ranges.push({ from: at, to: at + line.length + 1 });
    at += line.length + 1;
  }
  return { doc, ranges };
}

// Lezer wants its ranges mutable; a Span is not, and copying is cheaper than
// weakening the type the rest of the package reads.
const parseRanges = (doc: string, ranges: readonly Span[]) =>
  parser.parse(
    doc,
    undefined,
    ranges.map(({ from, to }) => ({ from, to })),
  );

describe("a Script parsed over ranges, as an indented Fence is", () => {
  const cases = [
    {
      name: "plain statements",
      script: 'box "one"\narrow\ncircle "two"',
    },
    {
      name: "a Macro call with an argument list",
      script: 'define pill { box rad 0.3 "$1" }\npill("one")\npill("two") at last box',
    },
    {
      name: "a Macro argument list spanning a continuation line",
      script: 'define pair { box "$1" ; box "$2" }\npair("one", \\\n  "two")',
    },
    {
      name: "all four kinds of dot",
      script:
        "Outer: [ Inner: box ]\ncircle at Outer.Inner.ne\nx1 = Outer.Inner.x\nprint Outer.wid",
    },
  ];

  it.each(cases)("$name parses the same as it does unindented", ({ script }) => {
    expect(errorSpans(parser.parse(script))).toEqual([]);

    for (const indent of [2, 4, 8]) {
      const { doc, ranges } = indentedFence(script, indent);

      expect(errorSpans(parseRanges(doc, ranges))).toEqual([]);
    }
  });

  it("does not mistake an indented `(` for a Macro argument list", () => {
    // The `(` opens the line, so the character before it is across the gap.
    // Upstream's rule is that a Macro's `(` follows its name with no space —
    // the stripped indentation must not be read as that name.
    const { doc, ranges } = indentedFence("box\n(0,0)", 4);

    expect(errorSpans(parseRanges(doc, ranges)).length).toBeGreaterThan(0);
    expect(errorSpans(parser.parse("box\n(0,0)")).length).toBeGreaterThan(0);
  });
});
