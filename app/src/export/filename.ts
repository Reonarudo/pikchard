/**
 * What an Export is called (#1021, #1055).
 *
 * Off the Document's **Name** and never its Identity (#1054): a Document opened
 * in Firefox has a Name and no way home, and still exports as `report-2.svg`.
 * The Name is also what the user sees in the title bar, so the suggested
 * filename is the one they would have typed.
 */

import { UNTITLED } from "../store.js";

export interface ExportSubject {
  /** The Document's Name. */
  readonly name: string;
  /** How many Scripts the Document has. */
  readonly count: number;
  /** Which Script is Active, zero-based. */
  readonly activeIndex: number | null;
}

/**
 * `flow.pikchr` → `flow.svg`; `report.md` with three Fences and the second
 * Active → `report-2.svg`; an Untitled Document → `untitled.svg`.
 *
 * The `-n` appears only where there is more than one Script to tell apart:
 * numbering the only Script of a Document would be noise in every filename for
 * the sake of the Documents that have several.
 */
export function exportFilename({ name, count, activeIndex }: ExportSubject, format: "svg" | "png") {
  const suffix = count > 1 && activeIndex !== null ? `-${activeIndex + 1}` : "";
  return `${stemOf(name)}${suffix}.${format}`;
}

/**
 * The Name without its last extension. Only the last, so `flow.v2.pikchr` keeps
 * its version, and a Name with no extension at all is kept whole.
 *
 * "Untitled" is the one Name the app invented rather than read off a file, and
 * it goes out lowercased: a filename is not a title, and `untitled.svg` is what
 * every other app writes.
 */
function stemOf(name: string): string {
  if (name === UNTITLED) return UNTITLED.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}
