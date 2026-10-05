import { describe, expect, it } from "vitest";
import { DIRECTIONS, OBJECT_CLASSES, STATEMENT_KEYWORDS } from "./keywords.js";

describe("keyword lists", () => {
  it("lists the Object classes Pikchr can draw", () => {
    expect(OBJECT_CLASSES).toContain("box");
    expect(OBJECT_CLASSES).toContain("cylinder");
    expect(OBJECT_CLASSES).toContain("dot");
  });

  it("lists all fourteen classes upstream draws, diamond included", () => {
    expect([...OBJECT_CLASSES].sort()).toEqual([
      "arc",
      "arrow",
      "box",
      "circle",
      "cylinder",
      "diamond",
      "dot",
      "ellipse",
      "file",
      "line",
      "move",
      "oval",
      "spline",
      "text",
    ]);
  });

  it("lists the four directions", () => {
    expect([...DIRECTIONS].sort()).toEqual(["down", "left", "right", "up"]);
  });

  it("lists the non-drawing statement keywords", () => {
    expect([...STATEMENT_KEYWORDS].sort()).toEqual(["assert", "define", "print"]);
  });

  it("keeps the lists disjoint, so a word maps to one category", () => {
    const all = [...OBJECT_CLASSES, ...DIRECTIONS, ...STATEMENT_KEYWORDS];

    expect(new Set(all).size).toBe(all.length);
  });

  it("is lowercase throughout — an uppercase initial makes a word a Label", () => {
    for (const word of [...OBJECT_CLASSES, ...DIRECTIONS, ...STATEMENT_KEYWORDS]) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});
