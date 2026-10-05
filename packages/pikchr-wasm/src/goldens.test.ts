import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPikchr, type Renderer } from "./index.js";
import { diagramOffsets, renderSubset, stripAnnotation } from "./test-support.js";

/**
 * The Scripts come from @pikchard/pikchr-corpus, which holds upstream content;
 * the `.svg` goldens and `errors.txt` beside them here do not, because they are
 * output our own unpatched build produced (ADR 0011).
 */
const goldenDir = fileURLToPath(new URL("../test/corpus/", import.meta.url));

const renderScripts = new Map(renderSubset().map((script) => [script.name, script.text]));

const goldens = readdirSync(goldenDir)
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.replace(/\.svg$/, ""))
  .sort();

const errorCases = readFileSync(join(goldenDir, "errors.txt"), "utf8")
  .split("\n")
  .filter((line) => line.length > 0);

const scriptOf = (name: string) => {
  const text = renderScripts.get(name);
  if (text === undefined) throw new Error(`no Script named ${name} in the render subset`);
  return text;
};

/**
 * A statement starts the Script, a line, or follows `;`, `[` or `{`. Comments
 * and blank lines only ever put whitespace between that boundary and the
 * statement's first token, which is what `data-pik` must point at.
 */
const STATEMENT_BOUNDARY = /(?:^|[\n;[{])\s*$/;

let pikchr: Renderer;

beforeAll(async () => {
  pikchr = await loadPikchr();
});

describe("the patch only annotates", () => {
  it("has a corpus to check, with every Script accounted for", () => {
    // Every Script in the render subset is either a golden or a listed error
    // case; a half-generated golden set would fail here rather than silently
    // shrink.
    expect(renderScripts.size).toBeGreaterThan(0);
    expect(goldens.length + errorCases.length).toBe(renderScripts.size);
  });

  it.each(goldens)("%s renders exactly as unpatched pikchr does", (name) => {
    const expected = readFileSync(join(goldenDir, `${name}.svg`), "utf8");
    const result = pikchr.render(scriptOf(name), { cssClass: "pikchr" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stripAnnotation(result.svg).trimEnd()).toBe(expected.trimEnd());
  });

  it("emits no groups of its own", () => {
    // The goldens come from unpatched pikchr; if upstream ever started
    // emitting <g>, stripAnnotation would be silently discarding real output.
    for (const name of goldens) {
      expect(readFileSync(join(goldenDir, `${name}.svg`), "utf8")).not.toContain("<g");
    }
  });

  it.each(errorCases)("%s fails, as it does unpatched", (name) => {
    const script = scriptOf(name);
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toBe("");
    expect(result.error.span.from).toBeGreaterThanOrEqual(0);
    expect(result.error.span.to).toBeLessThanOrEqual(script.length);
  });
});

describe("every annotated element points at a token in its Script", () => {
  it.each(goldens)("%s", (name) => {
    const script = scriptOf(name);
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const found = diagramOffsets(result.svg);
    const elements = result.svg.match(/<(g|path|circle|ellipse|polygon|text)\b/g) ?? [];

    // Every emitted element carries exactly one offset — the Objects and text
    // pikchr draws, plus the group wrapping each [] container. A Script with
    // no Objects draws nothing and so annotates nothing.
    //
    // The exception is `debug_label_color`, whose dots pikchr paints from a
    // scratch object that no statement produced; those carry no offset, which
    // is the honest answer for them.
    if (script.includes("debug_label_color")) {
      expect(found.length).toBeLessThan(elements.length);
    } else {
      expect(found.length).toBe(elements.length);
    }

    for (const offset of found) {
      expect(offset).toBeLessThan(script.length);
      // An offset names the statement's first token, so it lands on that
      // token's first character, with nothing but a statement boundary and
      // whitespace before it. (Objects from a Macro report the call site,
      // which is itself a statement, so the same rule holds for them.)
      expect(script.slice(offset, offset + 1)).toMatch(/\S/);
      expect(script.slice(0, offset)).toMatch(STATEMENT_BOUNDARY);
    }
  });
});
