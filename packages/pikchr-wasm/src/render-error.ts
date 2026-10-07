import type { ScriptOffsets } from "./offsets.js";

/** A start/end offset range within a Script, in UTF-16 code units. */
export interface Span {
  from: number;
  to: number;
}

/** The single error at which Pikchr stopped, with the Span it stopped at. */
export interface RenderError {
  message: string;
  span: Span;
}

/**
 * pikchr indents its caret row by a fixed 11 columns plus the count of bytes
 * it walked back from the error to the start of its line. That walk stops on
 * the preceding newline, so it counts one extra on every line but the first —
 * hence the `lineNo > 1` correction below. Deriving the column this way rather
 * than from the width of the `/* %4d *​/  ` gutter also keeps working for
 * Scripts over 9999 lines, where the gutter widens but the caret does not.
 */
const CARET_INDENT = 11;

const ERROR_PREFIX = "ERROR: ";
const SCRIPT_LINE = /^\/\* *(\d+) \*\/ {2}/;
const CARET_LINE = /^( *)(\^+)/;

/**
 * Recover a Span from pikchr's plaintext error report.
 *
 * pikchr has no API for the position of an error — it only pretty-prints one,
 * as up to five lines of context, a caret row under the offending token, and
 * an `ERROR:` line. The line number comes from the gutter of the last echoed
 * line and the column from where the carets start, so the Span is the token
 * pikchr underlined — widened to a whole character where it is not, since
 * pikchr counts carets in bytes and we cannot underline half of one.
 *
 * Anything unparseable (an out-of-memory report, say) degrades to the whole
 * message at the start of the Script rather than to a wrong Span.
 */
export function parseRenderError(errorText: string, offsets: ScriptOffsets): RenderError {
  const lines = errorText.split("\n");
  const iError = lines.findIndex((line) => line.startsWith(ERROR_PREFIX));
  if (iError < 0) {
    return { message: errorText.trim(), span: { from: 0, to: 0 } };
  }

  const message = (lines[iError] as string).slice(ERROR_PREFIX.length).trim();
  const fallback = { message, span: { from: 0, to: 0 } };

  const caret = CARET_LINE.exec(lines[iError - 1] ?? "");
  const scriptLine = SCRIPT_LINE.exec(lines[iError - 2] ?? "");
  if (!caret || !scriptLine) return fallback;

  const lineNo = Number(scriptLine[1]);
  const overshoot = lineNo > 1 ? 1 : 0;
  const byteColumn = Math.max(0, (caret[1] as string).length - CARET_INDENT - overshoot);
  const fromByte = offsets.lineStartByte(lineNo) + byteColumn;

  return {
    message,
    span: {
      from: offsets.toUtf16(fromByte),
      to: offsets.toUtf16End(fromByte + (caret[2] as string).length),
    },
  };
}
