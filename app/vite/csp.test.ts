import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { contentSecurityPolicy, policyFor, WEB_POLICY } from "./csp.ts";

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe("the web build's Content Security Policy (ADR 0009)", () => {
  it("is the policy #1025 wrote down, directive for directive", () => {
    expect(WEB_POLICY).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'none'; " +
        "script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' blob: data:; font-src 'none'; connect-src 'self'; " +
        "worker-src 'self'; manifest-src 'self'",
    );
  });

  it("carries nothing a meta element makes inert", () => {
    // CSP3 §3.3: in a meta element these do nothing, and pretending otherwise
    // is the appearance of a defence rather than one.
    for (const inert of ["frame-ancestors", "sandbox", "report-uri", "report-to"]) {
      expect(WEB_POLICY).not.toContain(inert);
    }
  });

  it("allows the page's own inline scripts by hash, and nothing else inline", () => {
    // The theme is read before the first paint by an inline script in
    // `index.html` (#1022); without its hash the policy would block it and the
    // dark theme would flash white on every load.
    const body = "document.documentElement.dataset.theme = 'dark';";
    const html = `<head><script>${body}</script><script type="module" src="/assets/index.js"></script></head>`;

    const scripts = directive(policyFor(html), "script-src");

    expect(scripts).toBe(`script-src 'self' 'wasm-unsafe-eval' ${sha256(body)}`);
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it("is exactly the written policy when the page has no inline script", () => {
    expect(policyFor('<script type="module" src="/a.js"></script>')).toBe(WEB_POLICY);
  });

  it("hashes the real index.html's inline script", () => {
    expect(directive(policyFor(indexHtml), "script-src")).toMatch(/'sha256-[A-Za-z0-9+/]+=*'$/);
  });
});

describe("the plugin that delivers it", () => {
  it("runs only in a build: the dev server ships no policy at all", () => {
    // `@vitejs/plugin-react` injects an inline preamble in development, so a
    // dev policy would be a weaker, different one that tests nothing (ADR 0009).
    expect(contentSecurityPolicy().apply).toBe("build");
  });

  it("puts the policy first in the head, ahead of anything it governs", async () => {
    const plugin = contentSecurityPolicy();
    const hook = plugin.transformIndexHtml as {
      handler: (html: string) => unknown;
    };

    const tags = await hook.handler("<head><script>x()</script></head>");

    expect(tags).toEqual([
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: policyFor("<script>x()</script>"),
        },
        injectTo: "head-prepend",
      },
    ]);
  });
});
