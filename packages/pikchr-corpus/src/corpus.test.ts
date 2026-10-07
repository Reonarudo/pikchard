import { describe, expect, it } from "vitest";
import { CORPUS_CHECKIN, corpusScripts, ORIGINS } from "./index.js";

const scripts = corpusScripts();

describe("the committed corpus", () => {
  it("is every Script the pinned check-in ships", () => {
    // A half-written corpus — an extraction that died partway, a directory
    // half-committed — fails here rather than quietly narrowing what the
    // grammar is held to.
    //
    // 261, not the 270 fences upstream contains: userman.md shows nine of its
    // Scripts twice over, once as `pikchr source toggle indent` and once as
    // `pikchr toggle indent`, and content-addressed naming folds a Script
    // shown two ways back into one file. They are listed in the manifest.
    expect(scripts.length).toBe(261);
    expect(countByOrigin()).toEqual({
      tests: 103,
      examples: 3,
      grammar: 4,
      fuzzcases: 3,
      doc: 148,
    });
  });

  it("names each Script by where upstream keeps it", () => {
    for (const script of scripts) {
      expect(ORIGINS).toContain(script.origin);
      expect(script.name.startsWith(`${script.origin}/`)).toBe(true);
      expect(script.name.endsWith(".pikchr")).toBe(true);
    }
  });

  it("names doc fences by their content, not their position", () => {
    // Ordinal names would make one fence inserted into userman.md a 70-file
    // rename at the next pin bump (ADR 0011).
    const fences = scripts.filter((s) => s.origin === "doc");

    for (const fence of fences) {
      expect(fence.name).toMatch(/^doc\/[\w.-]+-[0-9a-f]{8}\.pikchr$/);
    }
  });

  it("is sorted by name, and names nothing twice", () => {
    const names = scripts.map((s) => s.name);

    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("holds Scripts, not prose", () => {
    // The fence lines are what separates a Script from the Markdown around
    // it; if one leaked in, every consumer would be parsing the wrong text.
    for (const script of scripts) {
      expect(script.text).not.toMatch(/^(```|~~~)/m);
    }
  });

  it("gives every Script a body", () => {
    // `tests/empty.pikchr` is upstream's one deliberately empty Script.
    const empty = scripts.filter((s) => s.text.trim() === "");

    expect(empty.map((s) => s.name)).toEqual(["tests/empty.pikchr"]);
  });

  it("records the check-in it was extracted from", () => {
    expect(CORPUS_CHECKIN).toMatch(/^[0-9a-f]{64}$/);
  });
});

function countByOrigin(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const script of scripts) counts[script.origin] = (counts[script.origin] ?? 0) + 1;
  return counts;
}
