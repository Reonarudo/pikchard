import { expect, type Page, test } from "@playwright/test";

/**
 * The desktop build under the desktop Content Security Policy (ADR 0009, #1099).
 *
 * `tauri dev` loads the page straight from Vite and so ships no policy, which
 * leaves a violation invisible until a built app is launched. This serves the
 * desktop bundle from `vite preview` with `security.csp` from `tauri.conf.json`
 * as its header, hashed as Tauri hashes it (`vite/desktop-csp.ts`), and runs it
 * in WebKit, the engine of the macOS and Linux webviews, and in Chromium,
 * Windows's WebView2.
 *
 * In a browser the app takes `BrowserPlatform`, so Tauri's IPC is not reached
 * here. What is reached is everything the policy was written around: the
 * WASM renderer, the editor's injected styles, pikchr's inline style
 * attribute, and the theme script before the first paint. Item 2 of
 * `docs/desktop-release-checklist.md` looks at the real bundle.
 */

const content = "[data-testid='editor'] .cm-content";
const diagram = (page: Page) => page.getByTestId("preview").locator("svg");

test("the desktop build runs under the desktop policy with no violation", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as { __violations?: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  const response = await page.goto("./");

  // The policy is really there — a server that lost the header would pass the rest.
  expect(await response?.headerValue("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );

  await expect(diagram(page)).toBeVisible();
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("circle");
  await expect(diagram(page)).toBeVisible();
  await page.getByTestId("toolbar-toggleTheme").click();
  await expect(diagram(page)).toBeVisible();

  expect(
    await page.evaluate(() => (globalThis as { __violations?: string[] }).__violations ?? []),
  ).toEqual([]);
});
