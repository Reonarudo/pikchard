/**
 * The web build's Content Security Policy (ADR 0009, #1025).
 *
 * Delivered as a `<meta http-equiv>` because GitHub Pages sends no custom
 * headers, and injected at build time by this plugin — which `vite.config.ts`
 * includes only when `TAURI_ENV_PLATFORM` is unset. It must never reach the
 * desktop build: Tauri 2 would take a shared meta tag as the desktop's only
 * policy, push its IPC onto the `postMessage` fallback and block `asset:` URLs.
 * The desktop's own, stricter policy is `security.csp` in `tauri.conf.json`.
 */

import { createHash } from "node:crypto";
import type { HtmlTagDescriptor, Plugin } from "vite";

/**
 * The policy, as #1025 wrote it. `frame-ancestors`, `sandbox` and reporting are
 * absent because CSP3 §3.3 makes them inert in a meta element; being framed is
 * accepted (ADR 0009).
 */
export const WEB_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // `blob:` for PNG export's rasterisation, `data:` for Vite's inlined assets.
  "img-src 'self' blob: data:",
  "font-src 'none'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

/** Every classic inline script's body — the ones a `src` does not load. */
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * The policy for one page: {@link WEB_POLICY}, with each of the page's inline
 * scripts allowed by its hash.
 *
 * `index.html` reads the theme in an inline script before the first paint
 * (#1022), which the written `script-src` would block — and the dark theme
 * would then flash white on every load. A hash allows exactly those bytes and
 * nothing else, so `script-src` stays free of `'unsafe-inline'`; and because it
 * is computed from the page being built, editing the script can never leave a
 * stale hash behind.
 */
export function policyFor(html: string): string {
  return withInlineScripts(WEB_POLICY, html);
}

/**
 * `policy` with `script-src` extended by the hash of each of `html`'s inline
 * scripts. Shared with the desktop policy's e2e server (`desktop-csp.ts`),
 * which does what Tauri does to the same page.
 */
export function withInlineScripts(policy: string, html: string): string {
  const hashes = [...html.matchAll(INLINE_SCRIPT)]
    .map(([, body]) => body ?? "")
    .filter((body) => body.trim() !== "")
    .map((body) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  if (hashes.length === 0) return policy;
  return policy.replace(/script-src [^;]*/, (sources) => `${sources} ${hashes.join(" ")}`);
}

/** Put the policy at the top of the built `index.html`, and only in a build. */
export function contentSecurityPolicy(): Plugin {
  return {
    name: "pikchard:content-security-policy",
    // The dev server ships no policy: `@vitejs/plugin-react` injects an inline
    // preamble there, so a dev policy would be a weaker one that tests nothing.
    apply: "build",
    transformIndexHtml: {
      // Last, so the hashes are of the page as it will be served.
      order: "post",
      handler: (html): HtmlTagDescriptor[] => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policyFor(html) },
          // First in the head: a policy governs only what comes after it.
          injectTo: "head-prepend",
        },
      ],
    },
  };
}
