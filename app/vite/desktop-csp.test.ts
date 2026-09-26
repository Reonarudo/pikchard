import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import tauriConf from "../src-tauri/tauri.conf.json" with { type: "json" };
import { DESKTOP_POLICY, desktopPolicyFor } from "./desktop-csp.ts";

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe("the desktop policy, as the e2e serves it (ADR 0009, #1099)", () => {
  it("is read from tauri.conf.json, so the e2e cannot drift from what ships", () => {
    expect(DESKTOP_POLICY).toBe(tauriConf.app.security.csp);
  });

  it("allows the page's inline scripts by hash, as Tauri does", () => {
    const body = "document.documentElement.dataset.theme = 'dark';";
    const html = `<head><script>${body}</script><script type="module" src="./assets/index.js"></script></head>`;

    expect(directive(desktopPolicyFor(html), "script-src")).toBe(
      `script-src 'self' 'wasm-unsafe-eval' ${sha256(body)}`,
    );
  });

  it("leaves style-src exactly as written, since Tauri is told not to touch it", () => {
    const html = "<head><style>body { color: red; }</style><script>x()</script></head>";

    expect(directive(desktopPolicyFor(html), "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });
});
