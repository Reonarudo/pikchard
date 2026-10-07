import type { RenderResult } from "@pikchard/pikchr-wasm";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { asMarkdown, bundle } from "./all.js";

/** A renderer that fails on any Script containing `bax`, as pikchr would. */
const render = (script: string): RenderResult =>
  script.includes("bax")
    ? ({ ok: false, error: { message: "syntax error" } } as unknown as RenderResult)
    : {
        ok: true,
        svg: `<svg data-script="${script.trim()}"><path data-pik="0"/></svg>`,
        width: 10,
        height: 10,
      };

describe("a Script as Markdown", () => {
  it("is the Script, verbatim, in a pikchr block", () => {
    expect(asMarkdown("box\narrow\n")).toBe("```pikchr\nbox\narrow\n```\n");
  });

  it("closes the block on a line of its own when the Script has no last newline", () => {
    expect(asMarkdown("box")).toBe("```pikchr\nbox\n```\n");
  });

  it("keeps the Script's own indentation", () => {
    expect(asMarkdown("  box\n    arrow\n")).toBe("```pikchr\n  box\n    arrow\n```\n");
  });
});

describe("every Diagram of a Document", () => {
  it("is one SVG per Script, named after the Document and numbered from one", () => {
    const { name, files, skipped } = bundle("notes.md", ["box\n", "circle\n"], render, "light");

    expect(name).toBe("notes.zip");
    expect(files.map((file) => file.name)).toEqual(["notes-1.svg", "notes-2.svg"]);
    expect(skipped).toEqual([]);
  });

  it("skips a Script that fails, keeping the others' numbers", () => {
    const { files, skipped } = bundle("notes.md", ["box\n", "bax\n", "circle\n"], render, "light");

    expect(files.map((file) => file.name)).toEqual(["notes-1.svg", "notes-3.svg"]);
    expect(skipped).toEqual([2]);
  });

  it("sends each Diagram as Export SVG does, without its offsets", () => {
    const { files } = bundle("notes.md", ["box\n"], render, "light");

    expect(files[0]?.svg).not.toContain("data-pik");
  });

  it("calls an Untitled Document's files what a single export would", () => {
    expect(bundle("Untitled", ["box\n"], render, "light").name).toBe("untitled.zip");
  });

  it("zips the files under their names, byte for byte", () => {
    const { files, zip } = bundle("notes.md", ["box\n", "circle\n"], render, "light");

    const unpacked = unzipSync(zip());
    expect(Object.keys(unpacked)).toEqual(["notes-1.svg", "notes-2.svg"]);
    expect(strFromU8(unpacked["notes-1.svg"] ?? new Uint8Array())).toBe(files[0]?.svg);
  });
});
