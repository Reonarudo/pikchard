import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentText, fidelityExtension, readDocument, writeDocument } from "./fidelity.js";

describe("reading a Document", () => {
  it("keeps LF text as it is", () => {
    expect(readDocument("box\narrow\n")).toEqual({
      text: "box\narrow\n",
      lineSeparator: "\n",
      byteOrderMark: false,
    });
  });

  it("detects CRLF and leaves the text alone — nothing is normalised on read", () => {
    expect(readDocument("box\r\narrow\r\n")).toEqual({
      text: "box\r\narrow\r\n",
      lineSeparator: "\r\n",
      byteOrderMark: false,
    });
  });

  it("takes the dominant line ending of a mixed Document", () => {
    expect(readDocument("a\r\nb\r\nc\nd\r\n").lineSeparator).toBe("\r\n");
    expect(readDocument("a\nb\nc\r\nd\n").lineSeparator).toBe("\n");
  });

  it("falls back to LF for a Document with no line ending at all", () => {
    expect(readDocument("box").lineSeparator).toBe("\n");
    expect(readDocument("").lineSeparator).toBe("\n");
  });

  it("strips a BOM, and remembers that it was there", () => {
    expect(readDocument("﻿box\n")).toEqual({
      text: "box\n",
      lineSeparator: "\n",
      byteOrderMark: true,
    });
  });

  it("strips the BOM before reading the line endings behind it", () => {
    expect(readDocument("﻿a\r\nb\r\n")).toEqual({
      text: "a\r\nb\r\n",
      lineSeparator: "\r\n",
      byteOrderMark: true,
    });
  });

  it("leaves a BOM that is not at the very start as the text it is", () => {
    expect(readDocument("box﻿\n").text).toBe("box﻿\n");
  });
});

describe("writing a Document back", () => {
  it("round-trips a CRLF Document with a BOM and no trailing newline, byte for byte", () => {
    const raw = "﻿# Title\r\n\r\n```pikchr\r\nbox\r\n```";
    const document = readDocument(raw);
    const state = EditorState.create({
      doc: document.text,
      extensions: [fidelityExtension(document)],
    });

    expect(writeDocument(documentText(state), document)).toBe(raw);
  });

  it("round-trips an LF Document with no BOM", () => {
    const raw = "box\narrow\n";
    const document = readDocument(raw);
    const state = EditorState.create({
      doc: document.text,
      extensions: [fidelityExtension(document)],
    });

    expect(writeDocument(documentText(state), document)).toBe(raw);
  });

  it("confines the diff to the edited Script", () => {
    const raw = "﻿# Title\r\n\r\n```pikchr\r\nbox\r\n```\r\n\r\ntail";
    const document = readDocument(raw);
    const state = EditorState.create({
      doc: document.text,
      extensions: [fidelityExtension(document)],
    });
    // In a CRLF Document a line break is one position, so the Document's own
    // coordinates — not the raw string's — are the ones an edit speaks in.
    const at = state.doc.line(4).from;

    const edited = state.update({ changes: { from: at, to: at + 3, insert: "circle" } }).state;

    expect(writeDocument(documentText(edited), document)).toBe(raw.replace("box", "circle"));
  });

  it("never adds a trailing newline the Document did not have", () => {
    const document = readDocument("box");
    const state = EditorState.create({
      doc: document.text,
      extensions: [fidelityExtension(document)],
    });

    expect(writeDocument(documentText(state), document)).toBe("box");
  });
});

describe("a lone LF inside a CRLF Document", () => {
  // CodeMirror splits lines on the configured separator alone, so the stray
  // LF is text rather than a line break — which is what makes it survive.
  const raw = "a\r\nb\nc\r\n";
  const document = readDocument(raw);
  const state = EditorState.create({
    doc: document.text,
    extensions: [fidelityExtension(document)],
  });

  it("is not a line break", () => {
    expect(state.doc.lines).toBe(3);
    expect(state.doc.line(2).text).toBe("b\nc");
  });

  it("survives the round trip as the literal character it is", () => {
    expect(writeDocument(documentText(state), document)).toBe(raw);
  });
});
