import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * Export in a real browser (#1021).
 *
 * The only place the rasterisation is genuine: jsdom has no canvas, so
 * `export/png.ts` is unit-tested against a stand-in and what the three engines
 * actually produce can only be seen here.
 *
 * Every test runs with the File System Access API removed, which forces the
 * download path — the one export route a test can answer, since neither
 * `showSaveFilePicker` nor a native dialog can be driven. The picker path is
 * covered against the `FakePlatform` in `export/commands.test.tsx`.
 */

const content = "[data-testid='editor'] .cm-content";

/** No text in it: what the engines disagree about is glyph rasterisation. */
const FIXTURE = "box wid 1in ht 0.5in fill 0x2a6ebb";

/** The size pikchr computes for FIXTURE: what the exported SVG declares. */
const DIAGRAM_SIZE = { width: 148, height: 76 };

/** The same, doubled — PNG_SCALE is fixed at 2. */
const EXPECTED_PNG_SIZE = { width: 296, height: 152 };

test.beforeEach(async ({ page }) => {
  // Firefox and Safari are this branch for real; Chromium is pushed onto it so
  // the export lands in a file a test can read.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(FIXTURE);
  await expect(page.getByTestId("status-render")).toContainText("Rendered in");
});

/** Export through the toolbar and hand back what was downloaded. */
async function exported(page: import("@playwright/test").Page, what: "svg" | "png") {
  const downloading = page.waitForEvent("download");
  if (what === "svg") await page.getByTestId("toolbar-exportSvg").click();
  else {
    await page.getByTestId("file-menu").click();
    await page.getByTestId("command-exportPng").click();
  }
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error("the download produced no file");
  return {
    name: download.suggestedFilename(),
    bytes: await import("node:fs/promises").then((fs) => fs.readFile(path)),
  };
}

test("writes an SVG that is the same file in every engine", async ({ page }) => {
  const { name, bytes } = await exported(page, "svg");
  const svg = bytes.toString("utf8");

  expect(name).toBe("untitled.svg");
  // A rewrite of a string, so unlike the PNG this really is engine-independent:
  // the size, the font stack and the viewBox are all there, and no data-pik is.
  expect(svg).toContain(`width="${DIAGRAM_SIZE.width}"`);
  expect(svg).toContain(`height="${DIAGRAM_SIZE.height}"`);
  expect(svg).toContain("viewBox=");
  expect(svg).toContain("font-family=");
  // `data-pik="…"` goes; `data-pikchr-date` is pikchr's own and stays.
  expect(svg).not.toContain('data-pik="');
  expect(svg).toContain("data-pikchr-date=");
  expect(svg.startsWith("<svg")).toBe(true);
});

test("writes a PNG at exactly twice the Diagram's size", async ({ page }) => {
  // Not compared byte-for-byte *across* engines: rasterisation is the engine's
  // own — anti-aliasing included — so the fixed 2× buys a stable *size*, which
  // is the part #1055's guard can actually hold. Determinism within an engine is
  // the test below.
  const { name, bytes } = await exported(page, "png");

  expect(name).toBe("untitled.png");
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  // IHDR: width and height are two big-endian 32-bit fields at offset 16.
  expect(bytes.readUInt32BE(16)).toBe(EXPECTED_PNG_SIZE.width);
  expect(bytes.readUInt32BE(20)).toBe(EXPECTED_PNG_SIZE.height);
});

test("writes the same PNG twice for the same Script", async ({ page }) => {
  const first = await exported(page, "png");
  const second = await exported(page, "png");

  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  expect(hash(second.bytes)).toBe(hash(first.bytes));
});

test("copies the Diagram, and says so", async ({ page, browserName }) => {
  // Chromium alone: `grantPermissions` is Chromium-only in Playwright, and
  // `navigator.clipboard.write` needs a permission no other engine will grant a
  // headless page. What the copy *builds* is asserted against the FakePlatform in
  // `export/commands.test.tsx`, on every Platform.
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only under Playwright");
  await page.context().grantPermissions(["clipboard-write"]);

  await page.getByTestId("toolbar-copyDiagram").click();

  await expect(page.getByTestId("toast")).toHaveText("Diagram copied");
});

test("exports the last Diagram that rendered, and says which one it was", async ({ page }) => {
  await page.locator(content).click();
  await page.keyboard.press("End");
  // Broken on purpose: the Diagram on screen is now older than the text.
  await page.keyboard.type("\nbox wid");
  await expect(page.getByTestId("status-render")).toContainText("Error at");

  await exported(page, "svg");

  await expect(page.getByTestId("toast")).toHaveText("Exported the last diagram that rendered");
});
