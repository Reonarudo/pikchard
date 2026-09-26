import { describe, expect, it } from "vitest";
import { UNTITLED } from "../store.js";
import { exportFilename } from "./filename.js";

describe("what an Export is called", () => {
  it("takes the Document's Name, with the extension swapped", () => {
    expect(exportFilename({ name: "flow.pikchr", count: 1, activeIndex: 0 }, "svg")).toBe(
      "flow.svg",
    );
    expect(exportFilename({ name: "flow.pikchr", count: 1, activeIndex: 0 }, "png")).toBe(
      "flow.png",
    );
  });

  it("numbers the Script only where there is more than one to tell apart", () => {
    // The 1-based index the status bar shows, so the file and the selector agree.
    expect(exportFilename({ name: "report.md", count: 3, activeIndex: 1 }, "svg")).toBe(
      "report-2.svg",
    );
    expect(exportFilename({ name: "report.md", count: 1, activeIndex: 0 }, "svg")).toBe(
      "report.svg",
    );
  });

  it("calls an Untitled Document's Export untitled", () => {
    expect(exportFilename({ name: UNTITLED, count: 1, activeIndex: 0 }, "svg")).toBe(
      "untitled.svg",
    );
  });

  it("keeps a Name that has no extension whole", () => {
    expect(exportFilename({ name: "notes", count: 1, activeIndex: 0 }, "png")).toBe("notes.png");
  });

  it("drops only the last extension, so a versioned Name survives", () => {
    expect(exportFilename({ name: "flow.v2.pikchr", count: 1, activeIndex: 0 }, "svg")).toBe(
      "flow.v2.svg",
    );
  });

  it("numbers nothing when there is no Active Script to number", () => {
    expect(exportFilename({ name: "report.md", count: 0, activeIndex: null }, "svg")).toBe(
      "report.svg",
    );
  });
});
