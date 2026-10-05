/**
 * The desktop policy, served by `vite preview` for `e2e/desktop-csp.spec.ts`
 * (ADR 0009, #1099).
 *
 * The real policy is `security.csp` in `tauri.conf.json`, sent as a header by
 * Tauri's own protocol and never in `tauri dev`, which loads the page straight
 * from Vite. So a violation would otherwise first show up in a built app. This
 * serves the desktop build under the same header, in a browser, so CodeMirror,
 * the WASM renderer and the theme script meet the policy under Playwright.
 *
 * It copies what Tauri does to the page: each inline script's hash is added to
 * `script-src`, and `style-src` is left as written, because
 * `dangerousDisableAssetCspModification` tells Tauri not to touch it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import tauriConf from "../src-tauri/tauri.conf.json" with { type: "json" };
import { withInlineScripts } from "./csp.ts";

/** `security.csp`, read from the file the desktop build ships with. */
export const DESKTOP_POLICY: string = tauriConf.app.security.csp;

/** The header Tauri would send with `html`. */
export function desktopPolicyFor(html: string): string {
  return withInlineScripts(DESKTOP_POLICY, html);
}

/** Send the desktop policy with every response from `vite preview`. */
export function desktopPolicyHeader(): Plugin {
  return {
    name: "pikchard:desktop-policy-header",
    configurePreviewServer(server) {
      const { root, build } = server.config;
      const html = readFileSync(resolve(root, build.outDir, "index.html"), "utf8");
      const policy = desktopPolicyFor(html);
      server.middlewares.use((_request, response, next) => {
        response.setHeader("Content-Security-Policy", policy);
        next();
      });
    },
  };
}
