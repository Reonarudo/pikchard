import { expect, test } from "@playwright/test";

/** The editable surface of the one CodeMirror over the Document (#1085). */
const content = "[data-testid='editor'] .cm-content";

/** Replace the whole Document with `script`. */
async function type(page: import("@playwright/test").Page, script: string) {
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(script);
}

test("renders the Diagram live, and reports how long it took", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("status-render")).toHaveText(/Rendered in \d+\.\d ms/);

  await type(page, "circle\narrow\ncircle");

  await expect(page.getByTestId("preview").locator("svg")).toBeVisible();
  await expect(page.getByTestId("status-render")).toHaveText(/Rendered in \d+\.\d ms/);
});

test("keeps the last good Diagram, dimmed, and shows the Render Error at its line", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.getByTestId("preview");

  await type(page, "box\nbax\n");

  // The banner, the dimming and the underline all wait for the same quiet
  // window — the Preview never blanks and never loses its Diagram (#1016).
  await expect(page.getByTestId("render-error")).toBeVisible();
  await expect(preview).toHaveAttribute("data-failed", "true");
  await expect(preview.locator("svg").first()).toBeVisible();
  // pikchr's own position, shown as pikchr reports it: it stops at the token
  // after the one it could not use, so the column is its to choose (#1100).
  await expect(page.getByTestId("status-render")).toHaveText(/^Error at 2:\d+$/);
  await expect(page.locator(".cm-lint-marker-error")).toBeVisible();

  // And it all goes away the moment the text renders again.
  await type(page, "box\nbox\n");

  await expect(page.getByTestId("render-error")).toHaveCount(0);
  await expect(preview).toHaveAttribute("data-failed", "false");
});

test("takes the cursor to the error from the status bar", async ({ page }) => {
  await page.goto("/");

  await type(page, "box\nbax\n");
  await expect(page.getByTestId("status-render")).toHaveText(/^Error at 2:\d+$/);
  await page.getByTestId("status-render").click();

  // The cursor lands on the line the Render stopped on — the line of the file.
  const line = await page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest(".cm-line")?.textContent;
  });
  expect(line).toBe("bax");
});

test("fits the Diagram, and holds the zoom the user chose", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("status-zoom")).toHaveText(/%\s·\sfit$/);

  await page.getByTestId("toolbar-zoomIn").click();

  const zoomed = await page.getByTestId("toolbar-zoomReset").textContent();
  await expect(page.getByTestId("status-zoom")).toHaveText(zoomed ?? "");

  await page.getByTestId("toolbar-fit").click();

  await expect(page.getByTestId("status-zoom")).toHaveText(/%\s·\sfit$/);
});

test("renders the Diagram again for the dark theme", async ({ page }) => {
  await page.goto("/");
  const svg = page.getByTestId("preview").locator("svg");

  const light = await svg.innerHTML();
  await page.getByTestId("toolbar-toggleTheme").click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Pikchr inverts the strokes itself, so the SVG is different markup — not
  // the same markup under a filter.
  expect(await svg.innerHTML()).not.toBe(light);
});
