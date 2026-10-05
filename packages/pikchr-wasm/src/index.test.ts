import { beforeAll, describe, expect, it } from "vitest";
import { loadPikchr, type Renderer } from "./index.js";
import { loadModule } from "./module.js";
import { scriptOffsets } from "./offsets.js";
import { parseRenderError } from "./render-error.js";
import { diagramOffsets } from "./test-support.js";
import { PINNED_VERSION } from "./version.js";

let pikchr: Renderer;

beforeAll(async () => {
  pikchr = await loadPikchr();
});

describe("Renderer.version", () => {
  it("reports the pinned upstream pikchr version", () => {
    expect(pikchr.version).toBe(PINNED_VERSION);
  });
});

describe("Renderer.render", () => {
  it("renders a Script to a Diagram with its intended pixel size", () => {
    const result = pikchr.render('box "Hello"');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toMatch(/^<svg\b/);
    expect(result.svg).toContain("Hello");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("applies the cssClass option to the root element", () => {
    const result = pikchr.render("circle", { cssClass: "diagram" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('class="diagram"');
  });

  it("renders dark-mode Diagrams with inverted colours", () => {
    const light = pikchr.render("box");
    const dark = pikchr.render("box", { darkMode: true });

    expect(light.ok && dark.ok).toBe(true);
    if (!light.ok || !dark.ok) return;
    expect(dark.svg).not.toBe(light.svg);
    expect(dark.svg).toContain("rgb(255,255,255)");
  });

  it("renders an empty Script without failing", () => {
    const result = pikchr.render("");

    expect(result.ok).toBe(true);
  });

  it("frees every WASM allocation it makes", async () => {
    const mod = await loadModule();
    // dlmalloc hands back the same block for the same request as long as
    // nothing before it leaked, so a drifting probe pointer means a leak.
    const probe = () => {
      const ptr = mod._malloc(64);
      mod._free(ptr);
      return ptr;
    };
    pikchr.render("box");
    const before = probe();
    for (let i = 0; i < 200; i++) pikchr.render(`box "n${i}"\narrow\ncircle`);
    pikchr.render("notathing");

    expect(probe()).toBe(before);
  });
});

describe("data-pik offsets", () => {
  it("points each Object's elements at its statement", () => {
    //          0123456789...
    const script = 'box "A"\ncircle "B"';
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // box path + box text, then circle + circle text.
    expect(diagramOffsets(result.svg)).toEqual([0, 0, 8, 8]);
    expect(script.slice(0, 3)).toBe("box");
    expect(script.slice(8, 14)).toBe("circle");
  });

  it("points a labelled statement at its Label, its first token", () => {
    const script = 'A: box "x"';
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(diagramOffsets(result.svg)).toEqual([0, 0]);
    expect(script.slice(0, 1)).toBe("A");
  });

  it("points a labelled [] container at its Label too", () => {
    const script = "C: [ box; circle ]";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('<g data-pik="0">');
    expect(diagramOffsets(result.svg)).toEqual([0, 5, 10]);
  });

  it("nests a group per [] container, each with its own offset", () => {
    const script = "[ [ box; circle ]; box ]";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Outer container, inner container, its two Objects, then the outer box.
    expect(diagramOffsets(result.svg)).toEqual([0, 2, 4, 9, 19]);
  });

  it("gives each call of one Macro its own call site", () => {
    const script = "define m { box }\nm\nm";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(diagramOffsets(result.svg)).toEqual([17, 19]);
  });

  it("gives an arrowhead the offset of its line Object", () => {
    const script = "box\narrow right";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The <polygon> arrowhead and the <path> line share the arrow's offset.
    const polygon = /<polygon[^>]*data-pik="(\d+)"/.exec(result.svg);
    expect(polygon?.[1]).toBe("4");
    expect(script.slice(4, 9)).toBe("arrow");
  });

  it("wraps a [] container in a group carrying the container's offset", () => {
    const script = "[ box; circle ]";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('<g data-pik="0">');
    expect(result.svg).toContain("</g>");
    // The children keep their own offsets inside the group.
    expect(diagramOffsets(result.svg)).toEqual([0, 2, 7]);
  });

  it("attributes Objects made by a Macro to the call site, not the body", () => {
    const script = "define twice { box; box }\ntwice";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both boxes come from the single call on line 2.
    expect(diagramOffsets(result.svg)).toEqual([26, 26]);
    expect(script.slice(26, 31)).toBe("twice");
  });

  it("emits no offset for pikchr's own debug-label dots", () => {
    // debug_label_color paints a dot per Label from a scratch object that no
    // statement produced. It is zero-filled, so an offset field that treated
    // zero as a real position would attribute every dot to offset 0.
    const script = "debug_label_color = Red\nA: box\nB: circle";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dots = result.svg.match(/<circle[^>]*fill:rgb\(255,0,0\)/g) ?? [];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) expect(dot).not.toContain("data-pik");
  });

  it("keeps the offset of a pikchr_date text Object", () => {
    // pikchr rewrites this token to point at a static string literal before
    // the parser sees it, so the offset must be stamped on the token first.
    const script = "box\npikchr_date";
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(diagramOffsets(result.svg)).toEqual([0, 4]);
    expect(script.slice(4)).toBe("pikchr_date");
  });

  it("reports offsets in UTF-16 code units, not bytes", () => {
    // "é" is 2 bytes but 1 UTF-16 unit; "𝄞" is 4 bytes but 2 units.
    const script = '"é𝄞" at 0,0\nbox';
    const boxAt = script.indexOf("box");
    const result = pikchr.render(script);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const found = diagramOffsets(result.svg);
    expect(found).toContain(boxAt);
    expect(script.slice(boxAt, boxAt + 3)).toBe("box");
  });
});

describe("Render Errors", () => {
  it("spans the token pikchr underlined, on a later line", () => {
    const script = "box\nbox at Nosuch.n\n";
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("no such object");
    expect(result.error.span).toEqual({ from: 11, to: 17 });
    expect(script.slice(11, 17)).toBe("Nosuch");
  });

  it("spans a token mid-way through the first line", () => {
    const script = "box color 1/0\n";
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("division by zero");
    // pikchr blames the "/" operator, not its operands.
    expect(result.error.span).toEqual({ from: 11, to: 12 });
    expect(script.slice(11, 12)).toBe("/");
  });

  it("reports a syntax error where the parser stopped, at end of input", () => {
    // pikchr only discovers this at the newline, so it points there rather
    // than at the statement that caused it. Reported as pikchr sees it.
    const script = 'box "A"\nnotathing\n';
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("syntax error");
    expect(result.error.span).toEqual({ from: 17, to: 18 });
  });

  it("reports the Span in UTF-16 code units", () => {
    const script = '"é" at 0,0\nbox at Nosuch.n\n';
    const bad = script.indexOf("Nosuch");
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.span).toEqual({ from: bad, to: bad + 6 });
  });

  it("points at the failing token inside a Macro body", () => {
    const script = "define bad { box at Nosuch.n }\nbad\n";
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("no such object");
    expect(result.error.span).toEqual({ from: 20, to: 26 });
    expect(script.slice(20, 26)).toBe("Nosuch");
  });

  it("spans the byte of an unrecognised token", () => {
    const script = "box\nbox § 3\n";
    const bad = script.indexOf("§");
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("unrecognized token");
    // pikchr underlines one byte, but "§" is two — the Span covers the whole
    // character rather than collapsing to nothing.
    expect(result.error.span).toEqual({ from: bad, to: bad + 1 });
    expect(script.slice(bad, bad + 1)).toBe("§");
  });

  it("points at the == of a failed assert", () => {
    const script = "assert( 1 == 2 )\n";
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("1 != 2");
    expect(result.error.span).toEqual({ from: 10, to: 12 });
    expect(script.slice(10, 12)).toBe("==");
  });

  it("reports an error on a last line that has no trailing newline", () => {
    const script = 'box "A"\nnotathing';
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("syntax error");
    // pikchr's end-of-input token always sits on the last byte of the Script.
    // Where that byte is a newline its error context steps off it and bumps
    // the caret back on, which is why the sibling test above lands on the
    // newline; with no trailing newline the caret stays on the last character.
    const end = script.length;
    expect(result.error.span).toEqual({ from: end - 1, to: end });
    expect(script.slice(end - 1, end)).toBe("g");
  });

  it("reports 'script is too complex' past the width of the line-number gutter", () => {
    // pikchr stops at its 100 000-token limit, and "box\n" is two tokens, so
    // it stops on the newline ending line 50 001 — where the `/* %4d */`
    // gutter of its error context has widened past four digits, while the
    // caret row, indented from the error's own column, has not.
    const line = "box\n";
    const script = line.repeat(60_000);
    const eol = 50_001 * line.length - 1;
    const result = pikchr.render(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("script is too complex");
    expect(result.error.span).toEqual({ from: eol, to: eol + 1 });
    expect(script.slice(eol, eol + 1)).toBe("\n");
  });

  it("degrades to a whole-message error when there is no caret to read", () => {
    // Not reachable from a Script; parseRenderError is exercised directly.
    const error = parseRenderError("\nOut of memory\n", scriptOffsets("box"));

    expect(error).toEqual({ message: "Out of memory", span: { from: 0, to: 0 } });
  });
});
