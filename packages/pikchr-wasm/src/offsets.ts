/**
 * Byte ↔ UTF-16 offset translation for one Script.
 *
 * pikchr works in bytes: a `data-pik` attribute and a Render Error both carry
 * byte offsets into the Script's UTF-8 encoding. The editor works in UTF-16
 * code units. Everything crossing the seam out of `render()` is translated
 * here, so no byte offset ever reaches the rest of the app.
 */

const DATA_PIK = /data-pik="(\d+)"/g;

export interface ScriptOffsets {
  /** The UTF-16 offset for a byte offset, clamped to the Script. */
  toUtf16(byteOffset: number): number;
  /**
   * As `toUtf16`, but for the end of a Span: a byte offset landing inside a
   * character rounds up past that character rather than back to its start.
   *
   * pikchr measures some tokens as a single byte — an unrecognised character,
   * say — so an end offset can fall mid-character. Rounding it down there
   * would produce an empty Span with nothing for the editor to underline.
   */
  toUtf16End(byteOffset: number): number;
  /** The byte offset at which 1-based `lineNo` starts, clamped to the Script. */
  lineStartByte(lineNo: number): number;
  /** A Diagram with its `data-pik` byte offsets rewritten as UTF-16 offsets. */
  toUtf16Diagram(svg: string): string;
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Hold an offset inside `[0, limit]`. */
function clampTo(offset: number, limit: number): number {
  return Math.min(Math.max(offset, 0), limit);
}

/** Whether `script` encodes to UTF-8 one byte per UTF-16 unit. */
function isAsciiOnly(script: string): boolean {
  for (let i = 0; i < script.length; i++) {
    if (script.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

export function scriptOffsets(script: string): ScriptOffsets {
  // Line starts are only ever needed to place a Render Error, so both paths
  // below compute them on demand rather than on every Render.
  let lineStarts: number[] | undefined;

  if (isAsciiOnly(script)) {
    const clamp = (byteOffset: number) => clampTo(byteOffset, script.length);
    return {
      toUtf16: clamp,
      // Every character is one byte, so no end offset can fall inside one.
      toUtf16End: clamp,
      lineStartByte(lineNo) {
        lineStarts ??= asciiLineStarts(script);
        return lineStarts[lineNo - 1] ?? script.length;
      },
      // An ASCII Script needs no rewrite, which is the common case by far.
      toUtf16Diagram: (svg) => svg,
    };
  }

  // One entry per byte, plus one for the end. Bytes in the middle of a
  // multi-byte sequence map back to the start of the character they belong to.
  let byteLength = 0;
  for (const ch of script) byteLength += utf8Length(ch.codePointAt(0) as number);

  const byteToUtf16 = new Int32Array(byteLength + 1);
  let b = 0;
  let u = 0;
  for (const ch of script) {
    const nBytes = utf8Length(ch.codePointAt(0) as number);
    for (let k = 0; k < nBytes; k++) byteToUtf16[b + k] = u;
    b += nBytes;
    u += ch.length;
  }
  byteToUtf16[byteLength] = script.length;

  const clampByte = (byteOffset: number) => clampTo(byteOffset, byteLength);
  const toUtf16 = (byteOffset: number): number => byteToUtf16[clampByte(byteOffset)] as number;

  return {
    toUtf16,
    toUtf16End(byteOffset) {
      const byte = clampByte(byteOffset);
      const charStart = byteToUtf16[byte] as number;
      // A boundary byte starts its own character; anything else is a
      // continuation byte, and shares its start with the byte before it.
      if (byte === 0 || byte === byteLength || charStart !== byteToUtf16[byte - 1]) {
        return charStart;
      }
      let end = byte;
      while (end < byteLength && byteToUtf16[end] === charStart) end++;
      return byteToUtf16[end] as number;
    },
    lineStartByte(lineNo) {
      // '\n' is ASCII, so a line start is one byte past it in both spaces.
      lineStarts ??= asciiLineStarts(script).map((at) => utf16ToByte(byteToUtf16, at));
      return lineStarts[lineNo - 1] ?? byteLength;
    },
    toUtf16Diagram: (svg) =>
      svg.replace(DATA_PIK, (_all, byteOffset: string) => `data-pik="${toUtf16(+byteOffset)}"`),
  };
}

/** UTF-16 offsets of every line start. Valid for any Script — '\n' is ASCII. */
function asciiLineStarts(script: string): number[] {
  const starts = [0];
  for (let i = 0; i < script.length; i++) {
    if (script.charCodeAt(i) === 0x0a) starts.push(i + 1);
  }
  return starts;
}

/** Invert the byte → UTF-16 map at a known character boundary. */
function utf16ToByte(byteToUtf16: Int32Array, utf16Offset: number): number {
  let lo = 0;
  let hi = byteToUtf16.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((byteToUtf16[mid] as number) < utf16Offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
