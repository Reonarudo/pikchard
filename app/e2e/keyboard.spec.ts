import { expect, test } from "@playwright/test";
import { MENUS, TOOLBAR } from "../src/commands/menus.js";
import type { CommandId } from "../src/commands/registry.js";

/**
 * The keyboard baseline, in a real browser (#1101 guard 14).
 *
 * The rule v1 commits to: **every Command is operable from the keyboard alone,
 * and no surface takes focus it cannot give back.** These four are the machine
 * version of it — the third is the one #1100 previously had to catch by hand.
 *
 * Deliberately **no axe**: it would flag the gaps the README states as accepted,
 * and the suppression file needed to keep it green would become a second gap list
 * that disagreed with the first.
 */

const content = "[data-testid='editor'] .cm-content";

/** Every Command the web build puts on a surface — the native Edit menu aside. */
const WEB_COMMANDS: CommandId[] = [
  ...new Set([
    ...MENUS.filter((menu) => !menu.desktopOnly).flatMap((menu) =>
      menu.items.flatMap((item) => (item.kind === "command" ? [item.id] : [])),
    ),
    ...TOOLBAR.flat(),
  ]),
];

test("starts with the focus in the editor", async ({ page }) => {
  // An editor-first app: the chrome's tab stops sit behind Shift+Tab, and the
  // first thing typed lands in the Script (#1101 guard 6).
  await page.goto("/");

  await expect(page.locator(".cm-content")).toBeFocused();
});

test("lets Tab out of the editor, which is what stops it being a trap", async ({
  page,
  browserName,
}) => {
  // The behavioural regression test for guard 5: `indentWithTab` is never
  // imported, because Tab moving focus is what passes WCAG's no-keyboard-trap
  // criterion. One accidental import away, hence a test rather than a comment.
  //
  // Not asserted on Firefox, because Playwright's build of it moves focus nowhere
  // on Tab inside a `contenteditable` — nor on Escape-then-Tab. A real Firefox
  // does move it: checked by hand on 2026-09-25, so this is Playwright's quirk and
  // not a keyboard trap (`docs/platform-web-manual-checks.md`, check 1).
  test.skip(browserName === "firefox", "Playwright's Firefox does not move focus on Tab here");
  await page.goto("/");
  await expect(page.locator(".cm-content")).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(page.locator(".cm-content")).not.toBeFocused();
});

test("puts every Command within reach of the keyboard alone", async ({ page, browserName }) => {
  // Chromium alone, and for reasons outside the app: WebKit only tabs to buttons
  // when macOS's "Full Keyboard Access" is on, which is a system setting no test
  // can set, and Firefox's focus movement is the open question above. What this
  // asserts is the app's own doing — that no Command hides behind a Shortcut —
  // and that is not engine-specific (#1053 guard 3).
  test.skip(browserName !== "chromium", "tabbing to buttons is a system setting elsewhere");
  await page.goto("/");

  // Tab from the editor and walk the whole chrome, collecting what can be
  // reached. No pointer is used at any point.
  const reachable = new Set<string>();
  await page.locator(content).click();
  for (let step = 0; step < 80; step += 1) {
    const testid = await page.evaluate(() =>
      window.document.activeElement?.getAttribute("data-testid"),
    );
    if (testid) reachable.add(testid);
    // A menu button opens on Enter, so its items become reachable too.
    if (testid?.endsWith("-menu")) {
      await page.keyboard.press("Enter");
      for (let item = 0; item < 30; item += 1) {
        await page.keyboard.press("Tab");
        const inner = await page.evaluate(() =>
          window.document.activeElement?.getAttribute("data-testid"),
        );
        if (!inner || inner.endsWith("-menu")) break;
        reachable.add(inner);
      }
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Tab");
  }

  const unreachable = WEB_COMMANDS.filter(
    (id) => !reachable.has(`command-${id}`) && !reachable.has(`toolbar-${id}`),
  );
  expect(unreachable).toEqual([]);
});

test("gives focus back to the opener, from a menu and from a dialog alike", async ({ page }) => {
  await page.goto("/");

  // A menu: Escape closes it and focus returns to the button that opened it.
  await page.getByTestId("view-menu").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("view-menu")).toBeFocused();

  // A `<dialog>`: the browser's own focus restoration, which is why About is one.
  await page.getByTestId("help-menu").click();
  await page.getByTestId("command-about").click();
  await expect(page.getByTestId("about-close")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("about")).toBeHidden();
  await expect(page.getByTestId("help-menu")).toBeFocused();
});
