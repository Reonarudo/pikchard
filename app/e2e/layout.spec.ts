import { expect, test } from "@playwright/test";

/**
 * The split and the editor's own drawing, in a real browser (#1023, #1022).
 *
 * Both are layout and paint, which jsdom has neither of: whether the Preview
 * still has room once the editor is hidden, and whether the cursor can be seen
 * against the background it is drawn on.
 */

const content = "[data-testid='editor'] .cm-content";

test("hiding the editor gives the whole width to the Diagram", async ({ page }) => {
  await page.goto("/");
  const preview = page.getByTestId("preview");
  await expect(preview.locator("svg")).toBeVisible();
  const before = (await preview.boundingBox())?.width ?? 0;

  await page.getByTestId("toolbar-toggleEditor").click();

  await expect(page.locator(content)).toBeHidden();
  await expect(preview.locator("svg")).toBeVisible();
  // Not merely still there: wider than it was, because it has the editor's room.
  await expect.poll(async () => (await preview.boundingBox())?.width ?? 0).toBeGreaterThan(before);
});

test("showing the editor again puts it back where it was", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByTestId("editor");
  const width = (await editor.boundingBox())?.width ?? 0;

  await page.getByTestId("toolbar-toggleEditor").click();
  await page.getByTestId("toolbar-toggleEditor").click();

  await expect(page.locator(content)).toBeVisible();
  await expect.poll(async () => (await editor.boundingBox())?.width ?? 0).toBeCloseTo(width, 0);
});

test("hiding the editor from the keyboard leaves the focus somewhere it can be seen", async ({
  page,
}) => {
  // Mod+B from inside the editor: a focused editor that is no longer on screen
  // would take the next keystrokes where nobody can see them go (#1101).
  await page.goto("/");
  await expect(page.locator(content)).toBeFocused();

  await page.keyboard.press("ControlOrMeta+b");

  await expect(page.locator(content)).toBeHidden();
  await expect(page.getByTestId("toolbar-toggleEditor")).toBeFocused();

  // And Mod+B again hands the focus back to the editor it came from.
  await page.keyboard.press("ControlOrMeta+b");
  await expect(page.locator(content)).toBeFocused();
});

for (const theme of ["light", "dark"] as const) {
  test(`draws the cursor in the ${theme} theme's own ink`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    await expect(page.locator(content)).toBeFocused();

    // The cursor CodeMirror draws itself — `drawSelection` hides the native
    // caret — so it has to be given a colour that shows on this background.
    const cursor = page.locator(".cm-cursor").first();
    const [ink, fg] = await Promise.all([
      cursor.evaluate((element) => getComputedStyle(element).borderLeftColor),
      page.evaluate(() => getComputedStyle(document.documentElement).color),
    ]);

    expect(ink).toBe(fg);
  });
}
