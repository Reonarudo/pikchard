/**
 * A Renderer test double. Not exported from anywhere the app imports: like
 * `FakePlatform`, it is a test's tool and has no business in the app's graph.
 *
 * It fails on a marker word so a test can type its way into and out of a
 * Render Error, and it writes its inputs into the SVG so a test can tell which
 * Script and which theme produced the Diagram it is looking at.
 */

import type { Renderer, RenderOptions, RenderResult } from "@pikchard/pikchr-wasm";

/** The word that makes this Renderer fail, at the offset it occurs. */
export const BOOM = "boom";

export class FakeRenderer implements Renderer {
  readonly version = "fake";
  /** Every Render this double was asked for, in order. */
  readonly renders: { script: string; darkMode: boolean }[] = [];
  /** The size the next Diagram comes out at — a test changes it to grow one. */
  size = { width: 100, height: 50 };

  render(script: string, options: RenderOptions = {}): RenderResult {
    const darkMode = options.darkMode === true;
    this.renders.push({ script, darkMode });

    const at = script.indexOf(BOOM);
    if (at >= 0) {
      return {
        ok: false,
        error: {
          message: `unknown object type "${BOOM}"`,
          span: { from: at, to: at + BOOM.length },
        },
      };
    }
    return {
      ok: true,
      svg: `<svg data-script="${script.trim()}" data-dark="${darkMode}"></svg>`,
      ...this.size,
    };
  }
}
