import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentLanguage, languageExtension, languageForName } from "./language.js";
import { statementAtCursor, statementSpanAt } from "./statement.js";

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

describe("the statement the cursor is in", () => {
  /** Its start, as an offset into the Active Script, for the Diagram's `data-pik`. */
  function at(doc: string, name: string, cursor: number): number | null {
    return statementAtCursor(state(doc, name), cursor);
  }

  it("is found from anywhere in it, its end included", () => {
    expect(at(SCRIPT, "diagram.pikchr", 12)).toBe(12); // |arrow
    expect(at(SCRIPT, "diagram.pikchr", 14)).toBe(12); // ar|row
    expect(at(SCRIPT, "diagram.pikchr", 17)).toBe(12); // arrow|
  });

  it("is the child inside a container, and a labelled statement from its Label", () => {
    expect(at(SCRIPT, "diagram.pikchr", 22)).toBe(20); // ci|rcle
    expect(at(SCRIPT, "diagram.pikchr", 1)).toBe(0); // A|: box
  });

  it("is counted from the start of the Active Script, not of the file", () => {
    const doc = `# Notes\n\n\`\`\`pikchr\n${SCRIPT}\`\`\`\n`;
    const scriptStart = doc.indexOf("A:");

    expect(at(doc, "notes.md", scriptStart + 14)).toBe(12);
  });

  it("is nothing in the prose, nor on a line with no statement", () => {
    const doc = `# Notes\n\n\`\`\`pikchr\n${SCRIPT}\`\`\`\n`;

    expect(at(doc, "notes.md", 2)).toBeNull();
    expect(at("box\n\n\ncircle\n", "diagram.pikchr", 5)).toBeNull();
  });
});
