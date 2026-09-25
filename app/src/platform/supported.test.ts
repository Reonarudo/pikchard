import { describe, expect, it } from "vitest";
import { DOCUMENT_EXTENSIONS, isSupportedDocumentName } from "./supported.js";

describe("what Pikchard will open", () => {
  it("takes Pikchr and Markdown Documents", () => {
    expect(isSupportedDocumentName("diagram.pikchr")).toBe(true);
    expect(isSupportedDocumentName("diagram.pik")).toBe(true);
    expect(isSupportedDocumentName("notes.md")).toBe(true);
    expect(isSupportedDocumentName("notes.markdown")).toBe(true);
    expect(isSupportedDocumentName("notes.txt")).toBe(true);
  });

  it("refuses anything else, whatever the file happens to contain", () => {
    expect(isSupportedDocumentName("notes.pdf")).toBe(false);
    expect(isSupportedDocumentName("photo.png")).toBe(false);
    expect(isSupportedDocumentName("Makefile")).toBe(false);
  });

  it("does not care how the extension is cased, because the OS may not", () => {
    expect(isSupportedDocumentName("NOTES.MD")).toBe(true);
    expect(isSupportedDocumentName("Diagram.Pikchr")).toBe(true);
  });

  it("reads the extension off the name only, so a dotted directory is not one", () => {
    expect(isSupportedDocumentName("/home/me/v1.0/notes.md")).toBe(true);
    expect(isSupportedDocumentName("C:\\work\\v1.md\\report.pdf")).toBe(false);
  });

  it("offers the extensions the dialogs filter by, dot-free and in one place", () => {
    expect([...DOCUMENT_EXTENSIONS]).toEqual(["pikchr", "pik", "md", "markdown", "txt"]);
  });
});
