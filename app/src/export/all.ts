/**
 * Every Diagram of a Document at once, and a Script as Markdown (#1033).
 *
 * Export All renders each Script afresh rather than reading what the Preview
 * holds: the Preview only ever has the Active Script's Diagram. Each one goes
 * out exactly as Export SVG would send it, and together they go in one `.zip`,
 * on both Platforms, through the same Save dialog as every other Export.
 */

import type { RenderResult } from "@pikchard/pikchr-wasm";
import { strToU8, zipSync } from "fflate";
import type { Theme } from "../store.js";
import { stemOf } from "./filename.js";
import { exportableSvg } from "./svg.js";

/** A Script, verbatim, in a ```` ```pikchr ```` block, ready to paste into Markdown. */
export function asMarkdown(script: string): string {
  const body = script.endsWith("\n") ? script : `${script}\n`;
  return `\`\`\`pikchr\n${body}\`\`\`\n`;
}

export interface Bundle {
  /** What the `.zip` is called: the Document's stem, as a single Export would use. */
  readonly name: string;
  /** One SVG per Script that rendered, `stem-n.svg`, `n` its number from one. */
  readonly files: ReadonlyArray<{ readonly name: string; readonly svg: string }>;
  /** The numbers, from one, of the Scripts that failed and were left out. */
  readonly skipped: readonly number[];
  /** The `.zip` itself, built only when asked — after the Save dialog. */
  zip(): Uint8Array;
}

/**
 * Render every Script and gather the ones that worked.
 *
 * A Script that fails is left out but keeps its number, so `notes-3.svg` is
 * always the third Script whatever happened to the second: the user reads the
 * numbers against "Script 3 of 5", not against the files.
 */
export function bundle(
  documentName: string,
  scripts: readonly string[],
  render: (script: string) => RenderResult,
  theme: Theme,
): Bundle {
  const stem = stemOf(documentName);
  const files: Array<{ name: string; svg: string }> = [];
  const skipped: number[] = [];
  scripts.forEach((script, index) => {
    const result = render(script);
    if (!result.ok) {
      skipped.push(index + 1);
      return;
    }
    files.push({ name: `${stem}-${index + 1}.svg`, svg: exportableSvg(result, theme) });
  });
  return {
    name: `${stem}.zip`,
    files,
    skipped,
    zip: () => zipSync(Object.fromEntries(files.map(({ name, svg }) => [name, strToU8(svg)]))),
  };
}
