import { describe, expect, it } from "vitest";
import { scriptOffsets } from "./offsets.js";

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

describe("scriptOffsets", () => {
  it("treats an ASCII Script as its own byte encoding", () => {
    const offsets = scriptOffsets("box\ncircle");

    expect(offsets.toUtf16(4)).toBe(4);
    expect(offsets.lineStartByte(2)).toBe(4);
    // Nothing to rewrite, so a Diagram comes back untouched.
    expect(offsets.toUtf16Diagram('<path data-pik="4"/>')).toBe('<path data-pik="4"/>');
  });

  it("maps past a two-byte character", () => {
    // "é" is 1 UTF-16 unit but 2 bytes, so everything after it shifts by one.
    const script = '"é" box';
    const offsets = scriptOffsets(script);

    expect(utf8Length('"é" ')).toBe(5);
    expect(offsets.toUtf16(5)).toBe(script.indexOf("box"));
  });

  it("maps past a surrogate pair", () => {
    // "𝄞" is 2 UTF-16 units and 4 bytes.
    const script = '"𝄞" box';
    const offsets = scriptOffsets(script);

    expect(utf8Length('"𝄞" ')).toBe(7);
    expect(offsets.toUtf16(7)).toBe(script.indexOf("box"));
  });

  it("maps a byte inside a character back to where that character starts", () => {
    const offsets = scriptOffsets("é!");

    expect(offsets.toUtf16(0)).toBe(0);
    expect(offsets.toUtf16(1)).toBe(0);
    expect(offsets.toUtf16(2)).toBe(1);
  });

  it("rounds an end offset inside a character up past that character", () => {
    const offsets = scriptOffsets("é𝄞!");

    // Boundaries are the same in both directions.
    expect(offsets.toUtf16End(0)).toBe(0);
    expect(offsets.toUtf16End(2)).toBe(1);
    // Inside "é" (2 bytes) and inside "𝄞" (4 bytes, 2 UTF-16 units).
    expect(offsets.toUtf16End(1)).toBe(1);
    expect(offsets.toUtf16End(3)).toBe(3);
    expect(offsets.toUtf16End(5)).toBe(3);
  });

  it("rounds an end offset by character in an ASCII Script too", () => {
    const offsets = scriptOffsets("box");

    expect(offsets.toUtf16End(1)).toBe(1);
    expect(offsets.toUtf16End(999)).toBe(3);
  });

  it("clamps an end offset outside the Script", () => {
    const script = "éx";
    const offsets = scriptOffsets(script);

    expect(offsets.toUtf16End(-5)).toBe(0);
    // Exactly at the end, and past it: both stop at the end of the Script.
    expect(offsets.toUtf16End(utf8Length(script))).toBe(script.length);
    expect(offsets.toUtf16End(999)).toBe(script.length);
  });

  it("clamps offsets outside the Script", () => {
    const offsets = scriptOffsets("éx");

    expect(offsets.toUtf16(-5)).toBe(0);
    expect(offsets.toUtf16(999)).toBe(2);
  });

  it("finds line starts in byte space when lines contain wide characters", () => {
    const script = '"é" at 0,0\nbox\n"𝄞"\ncircle';
    const offsets = scriptOffsets(script);

    expect(offsets.lineStartByte(1)).toBe(0);
    expect(offsets.lineStartByte(2)).toBe(utf8Length('"é" at 0,0\n'));
    expect(offsets.lineStartByte(3)).toBe(utf8Length('"é" at 0,0\nbox\n'));
    expect(offsets.toUtf16(offsets.lineStartByte(4))).toBe(script.indexOf("circle"));
  });

  it("clamps a line number past the end of the Script", () => {
    const offsets = scriptOffsets("é");

    expect(offsets.lineStartByte(99)).toBe(2);
  });
});
