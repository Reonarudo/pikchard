import { BrowserPlatform } from "./browser.js";
import { detectPlatformKind } from "./detect.js";
import type { Platform } from "./types.js";

/**
 * Choose the Platform, once, at startup (ADR 0001). This is the only place in
 * the app that branches on which host we are running in.
 *
 * `TauriPlatform` is imported dynamically so the web bundle never pulls in
 * `@tauri-apps/*` — the desktop modules would otherwise ship to every browser
 * that will never call them.
 */
export async function createPlatform(): Promise<Platform> {
  if (detectPlatformKind() === "desktop") {
    const { TauriPlatform } = await import("./tauri.js");
    return new TauriPlatform();
  }
  return new BrowserPlatform();
}

// `FakePlatform` and `MemoryHandleStore` are deliberately absent: they are test
// doubles, and re-exporting them here would pull them into the production graph.
// Tests import them from their own modules.
export { BrowserPlatform } from "./browser.js";
export { detectPlatformKind } from "./detect.js";
export type { HandleStore } from "./handle-store.js";
export { IndexedDbHandleStore } from "./handle-store.js";
export { RecentList } from "./recent.js";
export {
  type ClipboardPayload,
  type DocumentRef,
  DocumentUnreadableError,
  type OpenedDocument,
  type Platform,
  type PlatformCapabilities,
  type PlatformKind,
  RECENT_LIMIT,
  type SaveAsResult,
  type UnreadableReason,
  type Unsubscribe,
  type WriteOutcome,
} from "./types.js";
