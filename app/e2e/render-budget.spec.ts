import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// page.evaluate runs outside Vite's module resolution, so the renderer is
// imported by the path the dev server serves it from rather than by name.
const RENDERER = `/@fs${fileURLToPath(new URL("../../packages/pikchr-wasm/src/index.ts", import.meta.url))}`;

/**
 * The Render budget from #1038: a 500-Object Script must Render in under 5 ms
 * in the browser, because #1016 runs a Render on every keystroke.
 *
 * Tagged @budget and excluded from `npm run e2e`: this is a wall-clock
 * measurement, and asserting one on shared CI hardware buys flakes, not
 * signal. Run it deliberately with `npm run budget -w @pikchard/app`, and
 * re-run it whenever the Render path changes.
 */
test("@budget a 500-Object Script Renders in under 5 ms", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("renderer-version")).toHaveText(/pikchr 1\.0/, {
    timeout: 15_000,
  });

  const timings = await page.evaluate(async (renderer) => {
    const { loadPikchr } = await import(/* @vite-ignore */ renderer);
    const pikchr = await loadPikchr();

    const lines = ["down"];
    for (let i = 0; i < 500; i++) {
      lines.push(i % 2 === 0 ? `B${i}: box "n${i}" wid 0.4 ht 0.2` : "arrow down 0.1");
    }
    const script = lines.join("\n");

    for (let i = 0; i < 20; i++) pikchr.render(script);
    const runs: number[] = [];
    for (let i = 0; i < 200; i++) {
      const started = performance.now();
      pikchr.render(script);
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);

    const result = pikchr.render(script);
    return {
      p50: runs[Math.floor(runs.length * 0.5)] as number,
      p95: runs[Math.floor(runs.length * 0.95)] as number,
      elements: result.ok ? (result.svg.match(/data-pik=/g) ?? []).length : 0,
    };
  }, RENDERER);

  console.log(`Render budget: p50 ${timings.p50.toFixed(2)} ms, p95 ${timings.p95.toFixed(2)} ms`);
  expect(timings.elements).toBe(1000);
  expect(timings.p95).toBeLessThan(5);
});
