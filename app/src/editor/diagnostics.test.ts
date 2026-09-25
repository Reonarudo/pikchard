import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { renderErrorDiagnostics } from "./diagnostics.js";

const state = EditorState.create({ doc: "box\narrow\nbox\n" });

describe("the Render Error as a Diagnostic", () => {
  it("is one Diagnostic, carrying Pikchr's own message", () => {
    expect(
      renderErrorDiagnostics(state, { span: { from: 4, to: 9 }, message: "syntax error" }),
    ).toEqual([{ from: 4, to: 9, severity: "error", source: "pikchr", message: "syntax error" }]);
  });

  it("is nothing at all when the Render succeeded", () => {
    expect(renderErrorDiagnostics(state, null)).toEqual([]);
  });

  it("stays inside the Document", () => {
    const [diagnostic] = renderErrorDiagnostics(state, {
      span: { from: 900, to: 1000 },
      message: "syntax error",
    });

    expect(diagnostic).toMatchObject({ from: state.doc.length, to: state.doc.length });
  });
});
