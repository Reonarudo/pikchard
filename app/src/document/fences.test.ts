import { describe, expect, it } from "vitest";
import { isPikchrInfoString } from "./fences.js";

describe("isPikchrInfoString", () => {
  it("accepts the bare tag", () => {
    expect(isPikchrInfoString("pikchr")).toBe(true);
  });

  it("ignores case, so a Document written by hand still renders", () => {
    expect(isPikchrInfoString("Pikchr")).toBe(true);
    expect(isPikchrInfoString("PIKCHR")).toBe(true);
  });

  it("accepts the rest of the info string, whatever it says", () => {
    expect(isPikchrInfoString("pikchr {x}")).toBe(true);
    expect(isPikchrInfoString("Pikchr {x}")).toBe(true);
    expect(isPikchrInfoString("pikchr source-ranges")).toBe(true);
    expect(isPikchrInfoString("pikchr toggle center")).toBe(true);
  });

  it("matches the first word only, not a prefix of it", () => {
    expect(isPikchrInfoString("pikchrx")).toBe(false);
    expect(isPikchrInfoString("pikchr-lite")).toBe(false);
    expect(isPikchrInfoString("not-pikchr")).toBe(false);
  });

  it("rejects an info string that only mentions pikchr later", () => {
    expect(isPikchrInfoString("text pikchr")).toBe(false);
  });

  it("tolerates the whitespace CommonMark allows around the info string", () => {
    expect(isPikchrInfoString("  pikchr  ")).toBe(true);
    expect(isPikchrInfoString("\tpikchr\t{x}")).toBe(true);
  });

  it("rejects an empty or absent info string — an untagged Fence is not a Script", () => {
    expect(isPikchrInfoString("")).toBe(false);
    expect(isPikchrInfoString("   ")).toBe(false);
  });
});
