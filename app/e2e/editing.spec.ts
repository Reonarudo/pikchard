import { expect, type Page, test } from "@playwright/test";

/**
 * Several selections at once, with Xcode's Shortcuts. The unit tests check the
 * bindings; moving vertically and dragging a column need layout, which only a
 * browser has.
 */

const content = "[data-testid='editor'] .cm-content";

async function type(page: Page, script: string) {
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(script);
}

const text = (page: Page) =>
  page.locator(`${content} .cm-line`).evaluateAll((lines) => lines.map((line) => line.textContent));

/** The client point at the left edge of column `col` on line `line`, both from zero. */
async function point(page: Page, line: number, col: number) {
  const at = await page
    .locator(`${content} .cm-line`)
    .nth(line)
    .evaluate((element, col) => {
      // The text sits in token spans, so walk to the text node itself.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!node) return null;
      const range = document.createRange();
      range.setStart(node, col);
      range.setEnd(node, col + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    }, col);
  if (!at) throw new Error(`no text on line ${line}`);
  return at;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("adds a cursor on the line below with Ctrl+Shift+Down, and types at both", async ({
  page,
}) => {
  await type(page, "box\nbox");
  await page.keyboard.press("ControlOrMeta+Home");

  await page.keyboard.press("Control+Shift+ArrowDown");
  await page.keyboard.type("A: ");

  await expect.poll(() => text(page)).toEqual(["A: box", "A: box"]);
});

test("selects a column with an Option-drag", async ({ page }) => {
  await type(page, "abc\nabc\nabc");

  const from = await point(page, 0, 1);
  const to = await point(page, 2, 2);
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.type("X");

  await expect.poll(() => text(page)).toEqual(["aXc", "aXc", "aXc"]);
});

test("selects the next occurrence with Option+Cmd+E", async ({ page }) => {
  await type(page, "box; circle; box");
  await page.keyboard.press("ControlOrMeta+Home");

  await page.keyboard.press("ControlOrMeta+Alt+e");
  await page.keyboard.press("ControlOrMeta+Alt+e");
  await page.keyboard.type("oval");

  await expect.poll(() => text(page)).toEqual(["oval; circle; oval"]);
});

test("searches the Document with its own panel on Mod+F in the editor", async ({ page }) => {
  await type(page, "box\ncircle\nbox");
  await page.keyboard.press("ControlOrMeta+Home");

  await page.keyboard.press("ControlOrMeta+f");
  const field = page.locator(".cm-search input[name='search']");
  await expect(field).toBeFocused();

  await page.keyboard.type("circle");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe("circle");

  // Escape closes the panel and gives the keyboard back to the editor.
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  await expect(page.locator(content)).toBeFocused();
});
