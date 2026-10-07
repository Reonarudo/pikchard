import { beforeAll, describe, expect, it } from "vitest";
import { loadPikchr, type Renderer } from "./index.js";
import { diagramOffsets } from "./test-support.js";

let pikchr: Renderer;

beforeAll(async () => {
  pikchr = await loadPikchr();
});

/** A Script of `n` Objects, chained so pikchr has real layout work to do. */
function chain(n: number): string {
  const lines: string[] = ["down"];
  for (let i = 0; i < n; i++) {
    lines.push(i % 2 === 0 ? `B${i}: box "n${i}" wid 0.4 ht 0.2` : "arrow down 0.1");
  }
  return lines.join("\n");
}

describe("Render speed", () => {
  it("renders a 500-Object Script fast enough to run on every keystroke", () => {
    const script = chain(500);
    for (let i = 0; i < 5; i++) pikchr.render(script);

    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      const result = pikchr.render(script);
      best = Math.min(best, performance.now() - started);
      expect(result.ok).toBe(true);
    }

    // The budget is 5 ms (#1038), and this Script measures ~3.5 ms in Chromium
    // and in Node on a warm machine. The assertion here is deliberately looser:
    // Vitest runs suites in parallel workers on shared CI hardware, so a 5 ms
    // wall-clock assertion would flake and get switched off. This catches an
    // order-of-magnitude regression, which is what a unit test can honestly
    // promise; the budget itself is checked by measuring, not by this test.
    expect(best).toBeLessThan(25);
  });

  it("renders 1000 annotated elements for that Script", () => {
    const result = pikchr.render(chain(500));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(diagramOffsets(result.svg)).toHaveLength(1000);
  });
});
