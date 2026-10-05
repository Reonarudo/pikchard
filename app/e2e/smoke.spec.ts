import { expect, test } from "@playwright/test";

/** The editable surface of the one CodeMirror over the Document (#1085). */
const content = "[data-testid='editor'] .cm-content";

test("boots in the browser with an editor/preview split", async ({ page }) => {
  await page.goto("/");

  // The web build draws its own menu bar; on the desktop the native one carries
  // the same Commands and these are absent (#1047).
  await expect(page.getByTestId("file-menu")).toBeVisible();
  await expect(page.getByTestId("toolbar")).toBeVisible();
  await expect(page.locator(content)).toContainText('text "Make it so."');
  await expect(page.getByTestId("preview").locator("svg")).toBeVisible();
});

test("keeps a Diagram in the Preview as the Script changes", async ({ page }) => {
  await page.goto("/");

  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("circle");

  await expect(page.locator(content)).toHaveText("circle");
  await expect(page.getByTestId("preview").locator("svg")).toBeVisible();
});

test("toggles the theme, and remembers it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  // On `html`, because that is where it is applied before the first paint — the
  // whole point of the inline reading in `index.html` (#1022).
  const html = page.locator("html");

  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByTestId("toolbar-toggleTheme").click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();

  // And no flash on the way back: the attribute is there before React is.
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("follows the system until the user chooses for themselves", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");

  await expect(html).toHaveAttribute("data-theme", "dark");

  // Live: the system changing its mind is not a reload.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByTestId("view-menu").click();
  await page.getByTestId("theme-dark").click();
  await page.emulateMedia({ colorScheme: "light" });

  // An explicit choice does not follow anything.
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("shows the pinned pikchr version in About, which is where a bug report finds it", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("help-menu").click();
  await page.getByTestId("command-about").click();

  await expect(page.getByTestId("about-version")).toContainText("Pikchard 0.");
  // The renderer has loaded by now, so this is the real pinned version.
  await expect(page.getByTestId("about-pikchr")).toContainText(/Pikchr 1\.\d/);
  await expect(page.getByTestId("about")).toContainText("MIT · pikchr is 0BSD");
});
