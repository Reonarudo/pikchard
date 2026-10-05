import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** `app/src` — this file's own directory, one level up. */
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    // Tests are excluded: this file names the pattern it is looking for.
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** `import … from "@tauri-apps/…"`, in either the static or the dynamic form. */
const TAURI_IMPORT = /(?:from|import)\s*\(?\s*["']@tauri-apps\//;

describe("the Platform seam", () => {
  it("keeps @tauri-apps behind the Tauri implementation (ADR 0001)", () => {
    const importers = sourceFiles(SOURCE_ROOT)
      .filter((path) => TAURI_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) => relative(SOURCE_ROOT, path));

    // The whole point of the seam: everything else takes a `Platform` and reads
    // `capabilities`, so nothing outside this file may reach for the host.
    expect(importers).toEqual(["platform/tauri.ts"]);
  });
});
