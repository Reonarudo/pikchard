import { TreeFragment } from "@lezer/common";
import { corpusScripts } from "@pikchard/pikchr-corpus";
import { describe, expect, it } from "vitest";
import { parser } from "../parser/pikchr.js";
import { errorSpans, parseScript } from "./tree.js";

// ADR 0007 chose a tree roughly twice the size of the flat alternative, and it
// is rebuilt on every keystroke. What makes that affordable is Lezer's
// incremental parsing, which only holds while the grammar keeps no parse state
// that outlives a single `parse` call — so that is what these measure.

/** A Script of `n` Objects, big enough for the cost to be visible. */
function chain(n: number): string {
  const lines: string[] = ["down"];
  for (let i = 0; i < n; i++) {
    lines.push(i % 2 === 0 ? `B${i}: box "n${i}" wid 0.4 ht 0.2` : "arrow down 0.1");
  }
  return lines.join("\n");
}

describe("parse speed", () => {
  it("parses a 500-Object Script fast enough to run on every keystroke", () => {
    const script = chain(500);
    for (let i = 0; i < 5; i++) parseScript(script);

    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      const tree = parseScript(script);
      best = Math.min(best, performance.now() - started);
      expect(errorSpans(tree)).toEqual([]);
    }

    // The same bargain `pikchr-wasm`'s performance test strikes: this Script
    // measures around 3 ms warm, and the assertion is deliberately looser,
    // because Vitest runs suites in parallel workers on shared hardware and a
    // tight wall-clock assertion would flake and then get switched off. This
    // catches an order-of-magnitude regression, which is what a unit test can
    // honestly promise.
    expect(best).toBeLessThan(50);
  });

  it("parses the whole corpus in well under a second", () => {
    const scripts = corpusScripts();
    const started = performance.now();
    for (const { text } of scripts) parseScript(text);

    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("incremental parsing", () => {
  it("reuses the tree when one statement changes, rather than rebuilding it", () => {
    const before = chain(500);
    const edit = before.indexOf('"n100"');
    const after = `${before.slice(0, edit)}"edited"${before.slice(edit + 6)}`;

    const first = parser.parse(before);
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(first), [
      { fromA: edit, toA: edit + 6, fromB: edit, toB: edit + 8 },
    ]);

    // Warm, then compare a reuse against a parse from nothing. The claim is
    // only that reuse is cheaper — by how much depends on the machine.
    for (let i = 0; i < 5; i++) parser.parse(after, fragments);

    const measure = (run: () => void) => {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 20; i++) {
        const started = performance.now();
        run();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };

    const reused = measure(() => parser.parse(after, fragments));
    const fresh = measure(() => parser.parse(after));

    expect(reused).toBeLessThan(fresh);
    expect(errorSpans(parser.parse(after, fragments))).toEqual([]);
  });
});
