import { afterEach, describe, expect, it } from "vitest";
import { detectPlatformKind } from "./detect.js";

const TAURI_MARKER = "__TAURI_INTERNALS__";

afterEach(() => {
  Reflect.deleteProperty(globalThis, TAURI_MARKER);
});

describe("detectPlatformKind", () => {
  it("is the Browser when Tauri has injected nothing", () => {
    expect(detectPlatformKind()).toBe("browser");
  });

  it("is the Desktop when Tauri has injected its globals", () => {
    Reflect.set(globalThis, TAURI_MARKER, {});

    expect(detectPlatformKind()).toBe("desktop");
  });
});
