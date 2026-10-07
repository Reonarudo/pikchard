import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPikchr } from "./index.js";
import { PINNED_VERSION } from "./version.js";

const lock = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vendor/pikchr.lock.json", import.meta.url)), "utf8"),
) as { version: string; checkin: string; short: string };

describe("the pinned check-in", () => {
  it("is the version the wrapper advertises", () => {
    expect(PINNED_VERSION).toBe(lock.version);
  });

  it("is the version the committed WASM build reports", async () => {
    // Catches a rebuild that silently picked up a different check-in, and a
    // lock bump that was never followed by `npm run build:wasm`.
    const pikchr = await loadPikchr();

    expect(pikchr.version).toBe(lock.version);
  });

  it("names a tarball matching the check-in", () => {
    expect(lock.short).toBe(lock.checkin.slice(0, 8));
  });
});
