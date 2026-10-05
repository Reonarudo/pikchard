import { expect, test } from "@playwright/test";

/**
 * The Document's life in a real browser (#1020).
 *
 * What only a browser can be asked: whether the Unsaved dot appears, whether the
 * work really survives a reload — the Draft is in the webview's own storage
 * (ADR 0010), so this is the one place the round trip is genuine — and whether
 * Recent is present or absent according to what the Platform can do.
 *
 * Save itself stops at a file dialog no test can answer, so what is saved where
 * is covered against the `FakePlatform` in `document/session.test.tsx`.
 */

/** The editable surface of the one CodeMirror over the Document (#1085). */
const content = "[data-testid='editor'] .cm-content";

/** Long enough for the debounced Draft write to have happened (#1054). */
const DRAFT_SETTLED_MS = 1500;

async function edit(page: import("@playwright/test").Page, text: string) {
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

test("shows the Document's Name, and a dot once it has changes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("document-title")).toHaveText("Untitled");
  await expect(page.getByTestId("unsaved-dot")).toBeHidden();

  await edit(page, "circle");

  await expect(page.getByTestId("unsaved-dot")).toBeVisible();
  await expect(page).toHaveTitle("• Untitled — Pikchard");
});

test("offers the unsaved work back after the page is closed and opened again", async ({ page }) => {
  await page.goto("/");
  await edit(page, "circle");
  await page.waitForTimeout(DRAFT_SETTLED_MS);

  await page.reload();

  // "Draft" is internal vocabulary; what the user is offered is unsaved work.
  await expect(page.getByText("Unsaved work from last time")).toBeVisible();
  await page.getByTestId("restore").click();

  await expect(page.locator(content)).toHaveText("circle");
  await expect(page.getByTestId("unsaved-dot")).toBeVisible();
});

test("takes the unsaved work away again when it is discarded", async ({ page }) => {
  await page.goto("/");
  await edit(page, "circle");
  await page.waitForTimeout(DRAFT_SETTLED_MS);
  await page.reload();

  await page.getByTestId("discard").click();
  await expect(page.getByText("Unsaved work from last time")).toBeHidden();
  await page.reload();

  await expect(page.getByText("Unsaved work from last time")).toBeHidden();
  await expect(page.locator(content)).toContainText('text "Make it so."');
});

test("keeps nothing to restore once the text is back where it started", async ({ page }) => {
  await page.goto("/");
  await edit(page, "circle");
  await page.waitForTimeout(DRAFT_SETTLED_MS);
  await expect(page.getByTestId("unsaved-dot")).toBeVisible();

  // Undone rather than retyped: what makes the text equal to the Baseline again
  // has to be the same characters, and only the editor's own history knows them.
  await page.locator(content).click();
  await expect
    .poll(
      async () => {
        await page.keyboard.press("ControlOrMeta+z");
        return page.getByTestId("unsaved-dot").isVisible();
      },
      { message: "the Document never came back to its Baseline" },
    )
    .toBe(false);
  await page.waitForTimeout(DRAFT_SETTLED_MS);
  await page.reload();

  await expect(page.getByText("Unsaved work from last time")).toBeHidden();
  await expect(page.getByTestId("unsaved-dot")).toBeHidden();
});

test("offers Open, Save and Save As, and Recent only where the browser can keep it", async ({
  page,
  browserName,
}) => {
  await page.goto("/");

  await page.getByTestId("file-menu").click();

  await expect(page.getByTestId("command-open")).toBeVisible();
  await expect(page.getByTestId("command-save")).toBeVisible();
  await expect(page.getByTestId("command-saveAs")).toBeVisible();
  // Chromium has the File System Access API and so can hold an Identity;
  // Firefox and Safari cannot, and there Recent is absent rather than empty
  // (#1054).
  const recent = page.getByTestId("file-menu-items").getByText("Recent", { exact: true });
  await expect(recent).toBeVisible({ visible: browserName === "chromium" });
});

test("opens a bundled Example as an Untitled Document", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("examples-menu").click();
  await page.getByTestId("example-flowchart").click();

  await expect(page.locator(content)).toContainText("diamond");
  await expect(page.getByTestId("document-title")).toHaveText("Untitled");
  // Opened, not edited: an Example arrives at its Baseline (#1044).
  await expect(page.getByTestId("unsaved-dot")).toBeHidden();
  await expect(page.getByTestId("preview").locator("svg")).toBeVisible();
});

test("asks before an Example replaces unsaved work", async ({ page }) => {
  await page.goto("/");
  await edit(page, "circle");

  await page.getByTestId("examples-menu").click();
  await page.getByTestId("example-shapes").click();

  await expect(page.locator(".prompt__title")).toHaveText("Save your changes?");
  await page.getByTestId("prompt-cancel").click();

  await expect(page.locator(content)).toHaveText("circle");
});

test("starts a new Document on the seed, with the cursor after it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("examples-menu").click();
  await page.getByTestId("example-shapes").click();
  await expect(page.locator(content)).toContainText("cylinder");

  await page.getByTestId("file-menu").click();
  await page.getByTestId("command-new").click();

  await expect(page.locator(content)).toContainText("Make it so.");
  // The cursor waits at the end of the seed, and the editor has the focus, so
  // typing continues the Script rather than going nowhere (#1044).
  await page.keyboard.type("circle");
  await expect(page.locator(content)).toContainText("italic at 0,-1.45circle");
});
