import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { COPY } from "./src/copy.ts";
import { contentSecurityPolicy } from "./vite/csp.ts";
import { desktopPolicyHeader } from "./vite/desktop-csp.ts";

// About shows the app's version (#1023), and a hand-kept copy of it would be
// wrong at the first release — so the one in `package.json` is the one shipped.
const { version } = createRequire(import.meta.url)("./package.json") as { version: string };

// Set by `tauri dev` when developing against a device on the network.
const host = process.env.TAURI_DEV_HOST;

/**
 * Whether this is the desktop build. Tauri sets `TAURI_ENV_PLATFORM` for both
 * `tauri dev` and `tauri build`, and it is the one switch between the two
 * builds (#1025): the web build gets a service worker, a manifest and a CSP
 * meta tag, and the desktop build gets none of them.
 */
const desktop = Boolean(process.env.TAURI_ENV_PLATFORM);

/**
 * Where the web build is served from: the GitHub Pages project path, unless a
 * fork rebuilds for its own host (#1025).
 *
 * Absolute rather than `./`: `vite-plugin-pwa` passes a relative base straight
 * through, so the manifest link, the worker's URL and its scope would resolve
 * against whichever page the user landed on — correct at `/pikchard/` and a 404
 * anywhere deeper (vite-pwa#873). v1 has no deep links, so this is insurance;
 * but a half-pinned build fails later and less legibly.
 */
const webBase = process.env.PIKCHARD_BASE_PATH ?? "/pikchard/";

/**
 * The static fallback for the manifest's colours: the light palette's bar and
 * page (`src/index.css`). A manifest colour cannot follow the theme switch; the
 * `theme-color` pair in `index.html` is what really themes the browser chrome.
 */
const LIGHT_BAR = "#f3f3f3";
const LIGHT_PAGE = "#ffffff";

// The app consumes the workspace packages from source rather than their built
// `dist`, so editing a package hot-reloads and no build ordering is needed.
// The trade-off: their `exports` maps are built but never exercised here, so a
// broken one only shows up when they are published — CI covers that in #1043.
const packageSource = (name: string) =>
  fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

/**
 * The web build's offline support (#1025): a Workbox `generateSW` worker that
 * precaches everything, in prompt mode, and the manifest that makes it
 * installable.
 */
function offlineWeb(): PluginOption {
  return VitePWA({
    strategies: "generateSW",
    // Never `autoUpdate`: that skips waiting and reloads open tabs, and an
    // editor is the worst app to yank out from under someone mid-keystroke.
    registerType: "prompt",
    // Registered by the app itself, through `virtual:pwa-register`, so that
    // the moment of registration and the update Toast are the app's to decide
    // (`src/offline/updates.ts`). Nothing inline, which the CSP would refuse.
    injectRegister: null,
    // In dev the plugin ships worker *logic* over a near-empty precache, which
    // is not a faithful preview. Offline behaviour is checked against
    // `vite preview` (`e2e/offline.spec.ts`).
    devOptions: { enabled: false },
    // The glob below already precaches every icon; this would list them twice.
    includeManifestIcons: false,
    manifest: {
      name: COPY.appName,
      short_name: COPY.appName,
      description: COPY.appDescription,
      // The Workbench has its own top bar; a browser strip above it would be
      // two competing chromes.
      display: "standalone",
      start_url: webBase,
      scope: webBase,
      theme_color: LIGHT_BAR,
      background_color: LIGHT_PAGE,
      // Chromium's installability wants exactly these sizes. Rendered from the
      // desktop icon's own source art by `scripts/web-icons.sh`.
      icons: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      // `wasm` is the line that matters: the default is css/js/html only, and
      // the renderer would silently not be precached — failing offline in
      // exactly the way #1025 forbids. Everything is precached and nothing is
      // runtime-cached: with no server and no CDN there is nothing to fetch.
      globPatterns: ["**/*.{js,css,html,wasm,png,svg,ico}"],
      // `navigateFallback` stays at its default bare `index.html`, which, like
      // the precache keys, resolves against the worker's own location and so
      // is already base-agnostic. Never an absolute path here.
    },
  });
}

/**
 * The desktop build has no service worker — Tauri's asset protocol is offline
 * by construction — so `virtual:pwa-register` resolves to a registration that
 * never happens and never has an update to announce.
 */
function noServiceWorker(): Plugin {
  const id = "\0pikchard:no-service-worker";
  return {
    name: "pikchard:no-service-worker",
    resolveId: (source) => (source === "virtual:pwa-register" ? id : null),
    load: (source) =>
      source === id ? "export function registerSW() { return async () => {}; }" : null,
  };
}

/** Exported on its own so `vitest.config.ts` can merge into it. */
export const config = {
  plugins: [react(), ...(desktop ? [noServiceWorker()] : [offlineWeb(), contentSecurityPolicy()])],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      "@pikchard/pikchr-wasm": packageSource("pikchr-wasm"),
      "@pikchard/lang-pikchr": packageSource("lang-pikchr"),
    },
  },
  // Tauri expects a fixed port and reads the Vite output itself.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    ...(host ? { host, hmr: { protocol: "ws" as const, host, port: 1421 } } : {}),
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // The web build takes Vite 8's own default, which is also above both the
    // `'wasm-unsafe-eval'` CSP floor (Safari 16) and the `import.meta` a
    // non-root base needs. The desktop keeps the targets Tauri's webviews want.
    target: desktop
      ? process.env.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : "safari13"
      : "baseline-widely-available",
    // `true` is Vite 8's own minifier (oxc); it no longer bundles esbuild.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
} satisfies UserConfig;

export default defineConfig(({ command, isPreview }) => ({
  ...config,
  // `vite preview` of the desktop build sends the desktop policy as Tauri
  // would, for `e2e/desktop-csp.spec.ts` (#1099). Preview only: the header is
  // Tauri's to send in the app, and `tauri dev` sends none.
  plugins: desktop && isPreview ? [...config.plugins, desktopPolicyHeader()] : config.plugins,
  // Relative on the desktop, where Tauri's asset protocol serves the bundle.
  // The dev server stays at the root, where Tauri and the e2e expect it; the
  // build, and `vite preview` serving it, are at the base Pages will use.
  base: desktop ? "./" : command === "build" || isPreview ? webBase : "/",
}));
