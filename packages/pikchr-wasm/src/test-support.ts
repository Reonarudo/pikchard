/** Helpers shared by this package's tests. Not part of the published entry point. */

import { corpusScripts, type Origin } from "@pikchard/pikchr-corpus";

/**
 * The Scripts this package renders, by the short name their golden carries:
 * `test01`, not `tests/test01.pikchr`.
 *
 * Only `tests/` and `examples/` — the corpus is wider than that on purpose,
 * for the grammar's sake (ADR 0011), and growing the golden set is a change to
 * argue on its own merits. `gen-goldens.sh` writes the goldens from this same
 * list, so what is rendered and what is checked cannot drift apart.
 */
export function renderSubset(): { name: string; text: string }[] {
  const origins: Origin[] = ["tests", "examples"];
  return corpusScripts()
    .filter((script) => origins.includes(script.origin))
    .map((script) => ({
      name: script.name.replace(/^\w+\/|\.pikchr$/g, ""),
      text: script.text,
    }));
}

/** Every `data-pik` offset in a Diagram, in the order the elements appear. */
export function diagramOffsets(svg: string): number[] {
  return [...svg.matchAll(/data-pik="(\d+)"/g)].map((m) => Number(m[1]));
}

/**
 * Undo the annotation the patch adds: the `data-pik` attributes themselves,
 * and the groups wrapping `[]` containers, which exist only to carry one.
 * Unpatched pikchr emits no `<g>` at all, so removing every group is safe —
 * `goldens.test.ts` holds that assumption to account.
 */
export function stripAnnotation(svg: string): string {
  return svg
    .split("\n")
    .filter((line) => !/^(<g data-pik="\d+">|<\/g>)$/.test(line))
    .join("\n")
    .replaceAll(/ data-pik="\d+"/g, "");
}
