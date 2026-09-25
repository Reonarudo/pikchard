import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY } from "../copy.js";
import type { PresentedError } from "../render/presentation.js";
import type { Diagram } from "../render/render.js";
import { Preview, type PreviewProps } from "./Preview.js";
import { stubPanZoom } from "./stub-panzoom.js";

const diagram: Diagram = { svg: "<svg><circle/></svg>", width: 120, height: 80 };

/** A viewport the Preview only reads, so the stub can be inert. */
const { panzoom } = stubPanZoom({ viewport: { scale: 2, x: 10, y: 20 } });

let container: HTMLDivElement;
let root: Root;
let inserted = 0;

function show(props: Partial<PreviewProps> = {}) {
  act(() =>
    root.render(
      <Preview
        diagram={diagram}
        error={null}
        hasScripts={true}
        panzoom={panzoom}
        onInsertDiagram={() => {
          inserted++;
        }}
        {...props}
      />,
    ),
  );
}

const find = (selector: string) => container.querySelector(selector);
const text = (selector: string) => find(selector)?.textContent ?? null;

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  inserted = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the Preview", () => {
  it("shows the Diagram at the size Pikchr computed, under the viewport", () => {
    show();

    const element = find(".preview__diagram") as HTMLElement;
    expect(element.style.width).toBe("120px");
    expect(element.style.height).toBe("80px");
    expect(element.style.transform).toBe("translate(10px, 20px) scale(2)");
    expect(find(".preview__diagram svg")).not.toBeNull();
  });

  it("announces the Diagram as one image rather than reading its labels out", () => {
    show();

    const element = find(".preview__diagram") as HTMLElement;
    expect(element.getAttribute("role")).toBe("img");
    expect(element.getAttribute("aria-label")).toBe(COPY.diagramLabel);
  });

  it("puts nothing into the SVG itself, which is what gets exported", () => {
    show();

    const svg = find(".preview__diagram svg") as SVGElement;
    expect(svg.getAttributeNames()).toEqual([]);
  });
});

describe("the Preview of a failed Render", () => {
  const error: PresentedError = {
    message: 'unknown object type "bax"',
    position: { line: 7, col: 3 },
  };

  it("keeps the last good Diagram, and says so to the eye", () => {
    show({ error });

    expect(find(".preview__diagram")).not.toBeNull();
    expect(find(".preview")?.getAttribute("data-failed")).toBe("true");
  });

  it("reads position, then Pikchr's own message", () => {
    show({ error });

    expect(text(".preview__banner")).toBe('7:3  unknown object type "bax"');
    expect(text("[data-testid='render-error-message']")).toBe('unknown object type "bax"');
  });

  it("shows the banner alone when nothing has ever rendered", () => {
    show({ diagram: null, error: { ...error, position: { line: 1, col: 1 } } });

    expect(find(".preview__diagram")).toBeNull();
    expect(find(".preview__banner")).not.toBeNull();
    expect(text(".preview")).toBe('1:1  unknown object type "bax"');
  });
});

describe("the Preview with nothing to show", () => {
  it("says nothing at all while the renderer is still loading", () => {
    show({ diagram: null });

    expect(text(".preview")).toBe("");
  });

  it("offers a way in when the Document has no Scripts", () => {
    show({ diagram: null, hasScripts: false });

    expect(text(".preview__hint")).toBe(`${COPY.noDiagrams} ${COPY.insertDiagram}`);
  });

  it("writes a Fence when that offer is taken", () => {
    show({ diagram: null, hasScripts: false });

    act(() => {
      (find("[data-testid='insert-fence']") as HTMLButtonElement).click();
    });

    expect(inserted).toBe(1);
  });
});
