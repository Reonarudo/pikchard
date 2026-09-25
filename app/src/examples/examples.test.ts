/**
 * What every bundled Example owes (#1044).
 *
 * Runs in Node rather than jsdom: the renderer's WASM is fetched by URL under a
 * browser-shaped environment, and here it is loaded from the filesystem. Nothing
 * in this file touches the DOM.
 *
 * The Examples are the app's second teaching surface, and a teaching surface that
 * fails to render teaches the wrong thing. So each one is put through the real
 * renderer in both themes and through the real grammar — the two ways an Example
 * can be broken — and the whole directory is checked for being a directory the
 * menu can list.
 */

// @vitest-environment node

import { errorSpans, parseScript } from "@pikchard/lang-pikchr";
import { loadPikchr, type Renderer } from "@pikchard/pikchr-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { EXAMPLES, exampleName } from "./examples.js";

let renderer: Renderer;

beforeAll(async () => {
  renderer = await loadPikchr();
});

describe("the bundled Examples", () => {
  it("are the six to eight #1044 asked for", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(EXAMPLES.length).toBeLessThanOrEqual(8);
  });

  it("are listed in bundle order, which is the order they teach in", () => {
    expect(EXAMPLES.map((example) => example.name)).toEqual([
      "Boxes and arrows",
      "Flowchart",
      "Swimlanes",
      "Shapes",
      "Splines and arcs",
      "Macro",
      "Colours",
      "Text styling",
    ]);
  });

  it("are named after their files, so the directory needs no manifest", () => {
    expect(exampleName("./02-flowchart.pikchr")).toBe("Flowchart");
    expect(exampleName("./05-splines-and-arcs.pikchr")).toBe("Splines and arcs");
  });

  it.each(EXAMPLES)("$name renders in the light theme", ({ script }) => {
    const result = renderer.render(script, { darkMode: false });

    expect(result.ok ? null : result.error.message).toBeNull();
  });

  it.each(EXAMPLES)("$name renders in the dark theme", ({ script }) => {
    // A dark Render is a different Render, not a restyled one (#1016), so an
    // Example can fail in one theme and not the other.
    const result = renderer.render(script, { darkMode: true });

    expect(result.ok ? null : result.error.message).toBeNull();
  });

  it.each(EXAMPLES)("$name parses with no error nodes at all", ({ script }) => {
    // The grammar is ours and the Examples are ours: an Example the highlighter
    // stumbles over is a bug in one of them, and this is where it shows up.
    expect(errorSpans(parseScript(script))).toEqual([]);
  });

  it.each(EXAMPLES)("$name ends with a newline, the way a file does", ({ script }) => {
    expect(script.endsWith("\n")).toBe(true);
  });
});
