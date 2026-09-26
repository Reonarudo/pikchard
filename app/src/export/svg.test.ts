import { describe, expect, it } from "vitest";
import type { Diagram } from "../render/render.js";
import { DIAGRAM_FONT, exportableSvg } from "./svg.js";

/** A Diagram shaped exactly as our pikchr build emits one. */
const diagram: Diagram = {
  svg: [
    `<svg xmlns='http://www.w3.org/2000/svg' style='font-size:initial;' class="pikchr"`,
    ` viewBox="0 0 112.32 76.32" data-pikchr-date="20260403102956">`,
    `<path d="M2.16,74.16L110.16,74.16L110.16,2.16L2.16,2.16Z" data-pik="0"`,
    ` style="fill:none;stroke-width:2.16;stroke:rgb(0,0,0);" />`,
    `<text x="56.16" y="38.16" data-pik="0" text-anchor="middle">box</text>`,
    `</svg>`,
  ].join(""),
  width: 112,
  height: 76,
};

const parse = (svg: string) => {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(parsed.querySelector("parsererror")).toBeNull();
  return parsed.documentElement;
};

describe("the exported SVG", () => {
  it("carries the size pikchr computed, so every engine agrees how big it is", () => {
    // WebKit falls back to 300×150, Chrome to the CSS object size and Firefox
    // used to fail outright — all three need width, height *and* viewBox (#1055).
    const root = parse(exportableSvg(diagram, "light"));

    expect(root.getAttribute("width")).toBe("112");
    expect(root.getAttribute("height")).toBe("76");
    expect(root.getAttribute("viewBox")).toBe("0 0 112.32 76.32");
  });

  it("overwrites a size pikchr set itself, which a scaled Script has", () => {
    const scaled: Diagram = {
      svg: diagram.svg.replace("<svg ", `<svg width="999" height="999" `),
      width: 224,
      height: 152,
    };

    const root = parse(exportableSvg(scaled, "light"));

    expect(root.getAttribute("width")).toBe("224");
    expect(root.getAttribute("height")).toBe("152");
  });

  it("names the Preview's font stack on the root, where text can inherit it", () => {
    // pikchr emits no font at all; as an image the file has no stylesheet to
    // inherit one from, so the stack has to be in the file (#1055).
    const root = parse(exportableSvg(diagram, "light"));

    expect(root.getAttribute("font-family")).toBe(DIAGRAM_FONT);
  });

  it("leaves pikchr's own font-family on an element alone", () => {
    // A declaration on the element beats an inherited value, which is what
    // keeps `mono` text monospaced in the exported file.
    const mono = {
      ...diagram,
      svg: diagram.svg.replace("<text ", `<text font-family="monospace" `),
    };

    const root = parse(exportableSvg(mono, "light"));

    expect(root.querySelector("text")?.getAttribute("font-family")).toBe("monospace");
  });

  it("strips every data-pik, which means nothing outside Pikchard", () => {
    const exported = exportableSvg(diagram, "light");

    expect(exported).not.toContain("data-pik=");
    // The date and the class are pikchr's own and stay.
    expect(parse(exported).getAttribute("class")).toBe("pikchr");
    expect(parse(exported).getAttribute("data-pikchr-date")).toBe("20260403102956");
  });

  it("stays transparent in the light theme", () => {
    const root = parse(exportableSvg(diagram, "light"));

    expect(root.querySelector("rect")).toBeNull();
  });

  it("opens with an opaque background in the dark theme, where the strokes are light", () => {
    // Mandatory: a dark Render goes through pikchr's PIKCHR_DARK_MODE and draws
    // in light ink, which on a transparent background is invisible (#1055).
    const root = parse(exportableSvg(diagram, "dark"));
    const first = root.firstElementChild;

    expect(first?.tagName).toBe("rect");
    // The full viewBox, in viewBox units rather than in pixels.
    expect(first?.getAttribute("x")).toBe("0");
    expect(first?.getAttribute("y")).toBe("0");
    expect(first?.getAttribute("width")).toBe("112.32");
    expect(first?.getAttribute("height")).toBe("76.32");
    expect(first?.getAttribute("fill")).toBe("#1b1b1b");
  });

  it("is a bare SVG: no prolog, no doctype, no comment about who made it", () => {
    const exported = exportableSvg(diagram, "light");

    expect(exported.startsWith("<svg")).toBe(true);
    expect(exported).not.toContain("<?xml");
    expect(exported).not.toContain("<!DOCTYPE");
    expect(exported).not.toContain("<!--");
    // `xmlns` is what makes it openable on its own.
    expect(exported).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("never touches the Diagram it was given", () => {
    const before = diagram.svg;

    exportableSvg(diagram, "dark");

    expect(diagram.svg).toBe(before);
  });
});
