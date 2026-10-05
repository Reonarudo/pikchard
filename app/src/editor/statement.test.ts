import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentLanguage, languageExtension, languageForName } from "./language.js";
import { statementSpanAt } from "./statement.js";

function state(doc: string, name: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [documentLanguage.of(languageExtension(languageForName(name)))],
  });
}

/** The statement's text, for reading the assertions. */
function statementAt(doc: string, name: string, offset: number): string | null {
  const editor = state(doc, name);
  const span = statementSpanAt(editor, offset);
  return span && editor.sliceDoc(span.from, span.to);
}

const SCRIPT = 'A: box "hi"\narrow\n[ circle; B: oval ]\ndefine pill { box rad 0.1 }\npill\n';

describe("the statement an Object came from", () => {
  it("is the whole statement, its Label included", () => {
    expect(statementAt(SCRIPT, "diagram.pikchr", 0)).toBe('A: box "hi"');
    expect(statementAt(SCRIPT, "diagram.pikchr", 12)).toBe("arrow");
  });

  it("is the child's own statement inside a container, and the container at `[`", () => {
    expect(statementAt(SCRIPT, "diagram.pikchr", 20)).toBe("circle");
    expect(statementAt(SCRIPT, "diagram.pikchr", 28)).toBe("B: oval");
    expect(statementAt(SCRIPT, "diagram.pikchr", 18)).toBe("[ circle; B: oval ]");
  });

  it("is the call site for an Object a Macro made", () => {
    expect(statementAt(SCRIPT, "diagram.pikchr", 66)).toBe("pill");
  });

  it("is found in a Fence of a Markdown Document, at the Document offset", () => {
    const doc = `# Notes\n\n\`\`\`pikchr\n${SCRIPT}\`\`\`\n`;
    const scriptStart = doc.indexOf("A:");

    expect(statementAt(doc, "notes.md", scriptStart + 12)).toBe("arrow");
    expect(statementAt(doc, "notes.md", scriptStart + 20)).toBe("circle");
  });

  it("is nothing outside every statement", () => {
    expect(statementAt("# Notes\n", "notes.md", 2)).toBeNull();
  });
});
