import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const TAURI_PLATFORM = readFileSync(resolve(HERE, "tauri.ts"), "utf8");
const CAPABILITY = JSON.parse(
  readFileSync(resolve(HERE, "../../src-tauri/capabilities/default.json"), "utf8"),
) as { permissions: string[] };

/** Every `getCurrentWindow().method(` in the Tauri Platform. */
function windowCalls(): string[] {
  const calls = [...TAURI_PLATFORM.matchAll(/getCurrentWindow\(\)\s*\.(\w+)\(/g)].flatMap(
    ([, method]) => (method ? [method] : []),
  );
  return [...new Set(calls)].sort();
}

/**
 * The permission a call needs. `on…` is a listener, which rides on the event
 * plugin; everything else is the window command of the same name.
 */
function permissionFor(method: string): string {
  if (method.startsWith("on")) return "core:event:allow-listen";
  return `core:window:allow-${method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** What `core:default` already grants for windows — read-only queries only. */
const GRANTED_BY_DEFAULT = new Set(["core:event:allow-listen"]);

describe("the desktop capability", () => {
  it("grants every window command the Tauri Platform calls", () => {
    // A refused command fails silently in the built app: v0.1.0's close
    // button did nothing, because Tauri's `onCloseRequested` always ends in
    // `destroy()`, and the title never changed, for want of `set-title`.
    const missing = windowCalls()
      .map(permissionFor)
      .filter((permission) => !GRANTED_BY_DEFAULT.has(permission))
      .filter((permission) => !CAPABILITY.permissions.includes(permission));

    expect(missing).toEqual([]);
  });

  it("finds the calls it is guarding", () => {
    // Guards the regex: if it stopped matching, the test above would pass
    // vacuously.
    expect(windowCalls()).toEqual(
      expect.arrayContaining(["destroy", "onCloseRequested", "setTitle"]),
    );
  });
});
