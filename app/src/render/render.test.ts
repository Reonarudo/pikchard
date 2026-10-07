import { describe, expect, it } from "vitest";
import { FakeRenderer } from "./fake.js";
import { NOT_RENDERED, renderScript, rerenderForTheme } from "./render.js";

const good = (renderer: FakeRenderer, script = "box\n") =>
  renderScript(renderer, script, "light", NOT_RENDERED);

describe("rendering a Script", () => {
  it("keeps the Diagram and the Script that made it", () => {
    const slice = good(new FakeRenderer(), "circle\n");

    expect(slice.lastGood).toEqual({
      diagram: {
        svg: '<svg data-script="circle" data-dark="false"></svg>',
        width: 100,
        height: 50,
      },
      script: "circle\n",
    });
    expect(slice.error).toBeNull();
  });

  it("renders dark Diagrams through Pikchr's own dark mode", () => {
    const renderer = new FakeRenderer();

    renderScript(renderer, "box\n", "dark", NOT_RENDERED);

    expect(renderer.renders).toEqual([{ script: "box\n", darkMode: true }]);
  });

  it("times every Render, for the status bar", () => {
    expect(good(new FakeRenderer()).elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps the last good Diagram when the current text fails", () => {
    const renderer = new FakeRenderer();
    const before = good(renderer);

    const after = renderScript(renderer, "boom\n", "light", before);

    expect(after.lastGood).toBe(before.lastGood);
    expect(after.error).toEqual({
      message: 'unknown object type "boom"',
      span: { from: 0, to: 4 },
    });
  });

  it("has no Diagram at all when the very first Render fails", () => {
    const slice = renderScript(new FakeRenderer(), "boom\n", "light", NOT_RENDERED);

    expect(slice.lastGood).toBeNull();
    expect(slice.error).not.toBeNull();
  });

  it("clears the error once the text renders again", () => {
    const renderer = new FakeRenderer();
    const broken = renderScript(renderer, "boom\n", "light", NOT_RENDERED);

    expect(renderScript(renderer, "box\n", "light", broken).error).toBeNull();
  });
});

describe("re-rendering for a theme", () => {
  it("renders the kept Script again, so the Diagram matches the theme", () => {
    const renderer = new FakeRenderer();

    const slice = rerenderForTheme(renderer, good(renderer, "box\n"), "dark");

    expect(slice.lastGood?.diagram.svg).toContain('data-dark="true"');
    expect(slice.lastGood?.script).toBe("box\n");
  });

  it("re-renders the kept Diagram, not the text that is failing", () => {
    const renderer = new FakeRenderer();
    const broken = renderScript(renderer, "boom\n", "light", good(renderer, "box\n"));

    const slice = rerenderForTheme(renderer, broken, "dark");

    expect(renderer.renders.at(-1)).toEqual({ script: "box\n", darkMode: true });
    expect(slice.error).toBe(broken.error);
    expect(slice.elapsedMs).toBe(broken.elapsedMs);
  });

  it("has nothing to do when nothing has ever rendered", () => {
    const renderer = new FakeRenderer();

    expect(rerenderForTheme(renderer, NOT_RENDERED, "dark")).toBe(NOT_RENDERED);
    expect(renderer.renders).toEqual([]);
  });
});
