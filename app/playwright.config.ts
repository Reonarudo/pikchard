import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:1420";

/**
 * The built web app, served as GitHub Pages will serve it: under its base path,
 * with the service worker and the CSP that only a build has (#1025).
 */
const PREVIEW_URL = "http://localhost:4173/pikchard/";

/**
 * The desktop build, served with the desktop policy as its header (#1099).
 * Built into its own directory so it never collides with the web build's.
 */
const DESKTOP_URL = "http://localhost:4174/";
// Being set is what makes it the desktop build; `darwin` also picks the
// `safari13` target the macOS and Linux webviews get, rather than Windows's.
const DESKTOP_ENV = { TAURI_ENV_PLATFORM: "darwin" };

/** The specs that need the web build rather than the dev server. */
const BUILT = /offline\.spec\.ts/;

/** The spec that needs the desktop build. */
const DESKTOP = /desktop-csp\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", testIgnore: [BUILT, DESKTOP], use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testIgnore: [BUILT, DESKTOP], use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testIgnore: [BUILT, DESKTOP], use: { ...devices["Desktop Safari"] } },
    {
      name: "built-chromium",
      testMatch: BUILT,
      use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_URL },
    },
    {
      name: "built-firefox",
      testMatch: BUILT,
      use: { ...devices["Desktop Firefox"], baseURL: PREVIEW_URL },
    },
    {
      name: "built-webkit",
      testMatch: BUILT,
      use: { ...devices["Desktop Safari"], baseURL: PREVIEW_URL },
    },
    // No Firefox: no desktop webview is Gecko.
    {
      name: "desktop-chromium",
      testMatch: DESKTOP,
      use: { ...devices["Desktop Chrome"], baseURL: DESKTOP_URL },
    },
    {
      name: "desktop-webkit",
      testMatch: DESKTOP,
      use: { ...devices["Desktop Safari"], baseURL: DESKTOP_URL },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
    },
    {
      command: "npm run build && npm run preview",
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      timeout: 180_000,
    },
    {
      command:
        "npx vite build --outDir dist-desktop && npx vite preview --outDir dist-desktop --port 4174",
      url: DESKTOP_URL,
      env: DESKTOP_ENV,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      timeout: 180_000,
    },
  ],
});
