import type { PlatformKind } from "./types.js";

/**
 * Which Platform this build is running in. Decided once at startup; nothing
 * else in the app branches on it (ADR 0001).
 *
 * Tauri injects `__TAURI_INTERNALS__` into the webview before any app code
 * runs, so its presence is the cheapest reliable signal that this is Desktop.
 */
export function detectPlatformKind(): PlatformKind {
  return "__TAURI_INTERNALS__" in globalThis ? "desktop" : "browser";
}
