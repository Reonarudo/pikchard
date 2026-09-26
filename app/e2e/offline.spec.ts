import { expect, type Page, test } from "@playwright/test";

/**
 * The built web app, as GitHub Pages will serve it (#1025).
 *
 * Against `vite preview` and never the dev server: the Content Security Policy
 * and the service worker exist only in a build, so the dev server would pass
 * all of this by testing nothing (ADR 0009). The page is `./` — the base path —
 * rather than `/`, which is the host's root and not Pikchard's.
 */

const content = "[data-testid='editor'] .cm-content";
const diagram = (page: Page) => page.getByTestId("preview").locator("svg");

/** Every CSP violation the page reports, collected from before its first script. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as { __violations?: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (globalThis as { __violations?: string[] }).__violations ?? []);
}

test("runs with no Content Security Policy violation", async ({ page }) => {
  const violations = await watchViolations(page);
  await page.goto("./");

  // The policy is really there — a build that lost it would pass the rest.
  await expect(page.locator("meta[http-equiv='Content-Security-Policy']")).toHaveCount(1);

  // The renderer's WASM, the theme read before the first paint, the editor's
  // injected styles and pikchr's inline style attribute — everything the
  // policy was written around — all on screen.
  await expect(diagram(page)).toBeVisible();
  await page.locator(content).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("circle");
  await expect(diagram(page)).toBeVisible();
  await page.getByTestId("toolbar-toggleTheme").click();
  await expect(diagram(page)).toBeVisible();

  expect(await violations()).toEqual([]);
});

test("fetches nothing from anywhere but its own origin", async ({ page }) => {
  // #1014 round 3: no analytics, no third-party scripts, no CDN. Every request
  // the page makes is to the host it came from.
  const origins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) origins.add(url.origin);
  });

  await page.goto("./");
  await expect(diagram(page)).toBeVisible();

  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test("names no other host anywhere in the page it serves", async ({ request, baseURL }) => {
  // #1014 round 3's CI check, made on the built `index.html` itself: a
  // reference that is never fetched during a test run is still a reference.
  const html = await (await request.get(baseURL ?? "")).text();

  expect(html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).toEqual([]);
});

test("is installable: a manifest, with the icons Chromium asks for", async ({ page, request }) => {
  await page.goto("./");
  const href = await page.locator("link[rel='manifest']").getAttribute("href");
  expect(href).toBe("/pikchard/manifest.webmanifest");

  const manifest = await (await request.get(new URL(href ?? "", page.url()).href)).json();

  expect(manifest).toMatchObject({
    name: "Pikchard",
    short_name: "Pikchard",
    display: "standalone",
    start_url: "/pikchard/",
    scope: "/pikchard/",
  });
  const sizes = manifest.icons.map((icon: { sizes: string; purpose?: string }) =>
    [icon.sizes, icon.purpose ?? "any"].join(" "),
  );
  expect(sizes).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(new URL(icon.src, new URL(href ?? "", page.url())).href)).ok()).toBe(
      true,
    );
  }
});

test("loads with the network off, once it has been visited", async ({
  page,
  context,
  browserName,
}) => {
  // Playwright drives service workers in Chromium only.
  test.skip(browserName !== "chromium", "service workers are Chromium-only under Playwright");

  await page.goto("./");
  await expect(diagram(page)).toBeVisible();
  // Registered after `load`, installed, and precaching done — then this page
  // is the worker's to serve.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();

  // The whole app: the editor, and a Diagram from the precached WASM renderer.
  await expect(page.locator(content)).toContainText('text "Make it so."');
  await expect(diagram(page)).toBeVisible();
  // And no Toast about it: the first install is not the user's decision.
  await expect(page.getByTestId("toast")).toHaveCount(0);
});
