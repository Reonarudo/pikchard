/**
 * The New-Document seed owes what an Example owes (#1044): it is the first
 * Diagram anyone sees (#1100), so it must render in both themes and parse
 * without an error the editor would underline.
 *
 * Node rather than jsdom, for the same reason as `examples/examples.test.ts`:
 * the renderer's WASM is loaded from the filesystem here.
 */

// @vitest-environment node

import { errorSpans, parseScript } from "@pikchard/lang-pikchr";
import { loadPikchr, type Renderer } from "@pikchard/pikchr-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { NEW_DOCUMENT_SCRIPT } from "./store.js";

let renderer: Renderer;

beforeAll(async () => {
  renderer = await loadPikchr();
});

describe("the New-Document seed", () => {
  it.each([false, true])("renders with darkMode %s", (darkMode) => {
    expect(renderer.render(NEW_DOCUMENT_SCRIPT, { darkMode }).ok).toBe(true);
  });

  it("parses with no error for the editor to underline", () => {
    expect(errorSpans(parseScript(NEW_DOCUMENT_SCRIPT))).toEqual([]);
  });
});
