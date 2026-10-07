import { expect, type Page, test } from "@playwright/test";
import { shareLink } from "../src/share/link.js";

/**
 * A Script shared as a link (#1032): the round trip through a real clipboard
 * and a real address bar. The encoding itself is share/link.test.ts's.
 */

const content = "[data-testid='editor'] .cm-content";

async function type(page: Page, script: string) {
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(script);
}

const SCRIPT = 'A: box "Café — naïve"\narrow\ncircle "ok"';

test("copies a link that opens the same Script in a new tab", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only under Playwright");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await type(page, SCRIPT);

  await page.getByTestId("file-menu").click();
  await page.getByTestId("command-copyLink").click();
  await expect(page.getByTestId("toast").last()).toHaveText("Link copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/#s=1\.[A-Za-z0-9_-]+$/);

  const other = await page.context().newPage();
  await other.goto(link);

  await expect(other.locator(content)).toHaveText(SCRIPT.replaceAll("\n", ""));
  await expect(other.getByTestId("document-title")).toContainText("Untitled");
  // The fragment is gone, so a reload does not open the link again.
  expect(new URL(other.url()).hash).toBe("");
});

test("asks about unsaved work before a link replaces it", async ({ page }) => {
  await page.goto("/");
  await type(page, "box");
  // The app's own encoder, run here, so this test needs no clipboard.
  const link = shareLink(page.url(), "circle\n");

  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, new URL(link).hash);

  await expect(page.getByTestId("prompt")).toBeVisible();
  await page.getByTestId("prompt-dont-save").click();
  await expect(page.locator(content)).toHaveText("circle");
});

test("says so when a link cannot be read", async ({ page }) => {
  await page.goto("/#s=1.not-a-script");

  await expect(page.getByTestId("toast").last()).toHaveText("Couldn't open the shared link");
  expect(new URL(page.url()).hash).toBe("");
});
