import { describe, expect, it } from "vitest";
import { errorSpans, parseScript, statementAt, symbols } from "./tree.js";

const at = (text: string, offset: number) => statementAt(parseScript(text), offset);
const textAt = (text: string, offset: number) => {
  const node = at(text, offset);
  return node && text.slice(node.from, node.to);
};

describe("statementAt", () => {
  it("finds the Statement the offset is inside", () => {
    const text = 'box "one"\ncircle "two"\narrow';

    expect(textAt(text, 12)).toBe('circle "two"');
  });

  it("finds the Statement the cursor sits at the end of", () => {
    const text = 'box "one"\ncircle "two"';

    expect(textAt(text, text.length)).toBe('circle "two"');
  });

  it("prefers the innermost Statement, inside a Sublist", () => {
    const text = "A: [ box\n  circle ]\narrow";

    expect(textAt(text, 13)).toBe("circle");
  });

  it("prefers the innermost Statement, inside a Macro body", () => {
    const text = 'define m { box "inner" }\ncircle';

    expect(textAt(text, 15)).toBe('box "inner"');
  });

  it("has nothing to say between statements", () => {
    expect(at("box;;circle", 4)).toBeUndefined();
  });

  it("has nothing to say in an empty Script", () => {
    expect(at("", 0)).toBeUndefined();
  });
});

describe("symbols", () => {
  const symbolsOf = (text: string) => symbols(parseScript(text), text);

  it("finds a Label, a Variable and a Macro, in source order", () => {
    const text = "$dx = 0.5\nA: box\ndefine pill { circle }";

    expect(symbolsOf(text).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "variable $dx",
      "label A",
      "macro pill",
    ]);
  });

  it("gives each Symbol the Span of its name, not of its statement", () => {
    const text = "A: box wid 2";
    const [symbol] = symbolsOf(text);

    expect(symbol?.span).toEqual({ from: 0, to: 1 });
    expect(text.slice(symbol?.span.from, symbol?.span.to)).toBe("A");
  });

  it("records definitions only — a later mention is a use", () => {
    const text = "A: box\narrow from A.n to A.s\nbox at A";

    expect(symbolsOf(text)).toHaveLength(1);
  });

  it("records a name defined twice twice, so a Lint can say so", () => {
    expect(symbolsOf("x = 1\nx = 2")).toHaveLength(2);
  });

  it("counts every form of assignment as defining its Variable", () => {
    const text = "a = 1\nb += 2\nc -= 3\nd *= 4\ne /= 5";

    expect(symbolsOf(text).map(({ name }) => name)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("reaches Symbols defined inside a Sublist and a Macro body", () => {
    const text = "Outer: [ Inner: box ]\ndefine m { $w = 3 }";

    expect(symbolsOf(text).map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "label Outer",
      "label Inner",
      "macro m",
      "variable $w",
    ]);
  });

  it("finds nothing in a Script that defines nothing", () => {
    expect(symbolsOf('box "a"\narrow\ncircle')).toEqual([]);
  });

  it("does not treat `x` and `y` as Variable names, because pikchr does not", () => {
    // Tempting to call this a bug in the port and "fix" it. It is not: `x` and
    // `y` are in upstream's keyword table as T_X/T_Y (`pikchr.y:4759-4760`),
    // and `%fallback ID EDGEPT` covers only the compass words, so pikchr
    // itself answers `x = 1` with a syntax error. `a = 1` and `n = 3` render.
    expect(errorSpans(parseScript("x = 1")).length).toBeGreaterThan(0);
    expect(errorSpans(parseScript("a = 1"))).toEqual([]);
  });
});

describe("errorSpans", () => {
  it("is empty for a Script that parses", () => {
    expect(errorSpans(parseScript('box "fine"'))).toEqual([]);
  });

  it("marks where the parse went wrong", () => {
    const spans = errorSpans(parseScript('box "before"\ncircle wid wid wid at at'));

    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every(({ from }) => from > 12)).toBe(true);
  });
});
