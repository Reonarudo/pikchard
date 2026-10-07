import { describe, expect, it } from "vitest";
import { type Candidate, objectAt, pickObject } from "./hit.js";

const at = (
  offset: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Candidate => ({
  offset,
  rect: { left, top, right, bottom },
});

describe("which Object a click lands on", () => {
  it("is the one whose box holds the point, inside as well as on the stroke", () => {
    // An unfilled box is only paint at its edges; a click in the middle still
    // means the box.
    expect(pickObject({ x: 50, y: 50 }, [at(0, 0, 0, 100, 100)])).toBe(0);
  });

  it("is nothing when the click is in empty space", () => {
    expect(pickObject({ x: 500, y: 500 }, [at(0, 0, 0, 100, 100)])).toBeNull();
  });

  it("is the smallest box holding the point, so a child beats its container", () => {
    const container = at(18, 0, 0, 200, 200);
    const circle = at(20, 10, 10, 50, 50);

    expect(pickObject({ x: 30, y: 30 }, [container, circle])).toBe(20);
    expect(pickObject({ x: 150, y: 150 }, [container, circle])).toBe(18);
  });

  it("forgives a few pixels, so a horizontal line can be clicked at all", () => {
    const line = at(12, 0, 50, 100, 50);

    expect(pickObject({ x: 40, y: 53 }, [line])).toBe(12);
    expect(pickObject({ x: 40, y: 60 }, [line])).toBeNull();
  });

  it("prefers what is drawn later when two boxes are the same size", () => {
    expect(pickObject({ x: 5, y: 5 }, [at(1, 0, 0, 10, 10), at(2, 0, 0, 10, 10)])).toBe(2);
  });
});

describe("a click on a rendered Diagram", () => {
  it("reads each element's offset and where it is on screen", () => {
    const diagram = document.createElement("div");
    diagram.innerHTML =
      '<svg><g data-pik="18"><circle data-pik="20"/></g><path data-pik="12"/><path/></svg>';
    // jsdom lays nothing out, so each element is told where it is.
    const boxes: Record<string, [number, number, number, number]> = {
      "18": [0, 0, 200, 200],
      "20": [10, 10, 50, 50],
      "12": [300, 50, 400, 50],
    };
    for (const element of diagram.querySelectorAll<SVGElement>("[data-pik]")) {
      const [left, top, right, bottom] = boxes[element.getAttribute("data-pik") ?? ""] ?? [
        0, 0, 0, 0,
      ];
      element.getBoundingClientRect = () => ({ left, top, right, bottom }) as DOMRect;
    }

    expect(objectAt(diagram, 30, 30)).toBe(20);
    expect(objectAt(diagram, 150, 150)).toBe(18);
    expect(objectAt(diagram, 350, 52)).toBe(12);
    expect(objectAt(diagram, 600, 600)).toBeNull();
  });
});
