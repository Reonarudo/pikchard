import { language as languageFacet, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { pikchrLanguage } from "@pikchard/lang-pikchr";
import { describe, expect, it } from "vitest";
import { scriptsOf } from "../document/scripts.js";
import {
  documentLanguage,
  documentLanguageEffect,
  isMarkdownDocument,
  languageExtension,
  languageForName,
} from "./language.js";

describe("the language a Document's Name implies", () => {
  it("gives Markdown to .md and .markdown", () => {
    expect(languageForName("notes.md")).toBe("markdown");
    expect(languageForName("notes.markdown")).toBe("markdown");
  });

  it("ignores the case of the extension", () => {
    expect(languageForName("NOTES.MD")).toBe("markdown");
    expect(languageForName("Notes.Markdown")).toBe("markdown");
  });

  it("gives Pikchr to .pikchr and .pik", () => {
    expect(languageForName("diagram.pikchr")).toBe("pikchr");
    expect(languageForName("diagram.pik")).toBe("pikchr");
  });

  it("gives Pikchr to an Untitled Document, which has no extension at all", () => {
    expect(languageForName("Untitled")).toBe("pikchr");
    expect(languageForName("")).toBe("pikchr");
  });

  it("gives Pikchr to anything else — the extension decides, never the content", () => {
    expect(languageForName("README.txt")).toBe("pikchr");
    expect(languageForName("archive.md.bak")).toBe("pikchr");
    // A dotfile's name is not an extension.
    expect(languageForName(".md")).toBe("pikchr");
  });
});

const state = (doc: string, name: string) =>
  EditorState.create({
    doc,
    extensions: [documentLanguage.of(languageExtension(languageForName(name))), []],
  });

describe("the configured language", () => {
  const markdown = "# Title\n\n```pikchr\nbox\n```\n";

  it("nests Pikchr inside a Markdown Document's Fences", () => {
    expect(state(markdown, "notes.md").facet(languageFacet)?.name).toBe("markdown");
    expect(scriptsOf(state(markdown, "notes.md"))).toHaveLength(1);
  });

  /** The node at `pos`, named outwards to the top of the tree. */
  const chain = (doc: string, pos: number): string[] => {
    const names: string[] = [];
    let node: SyntaxNode | null = syntaxTree(state(doc, "notes.md")).resolveInner(pos, 1);
    for (; node; node = node.parent) names.push(node.name);
    return names;
  };

  it("leaves the prose as Markdown, never as Pikchr", () => {
    // `# Title` is a Markdown heading, and nothing of Pikchr reaches it.
    expect(chain(markdown, 2)).toEqual(["ATXHeading1", "Document"]);
  });

  it("parses the Fence body as Pikchr, where the prose rules stop", () => {
    // A Pikchr `Script` mounted inside the Markdown `FencedCode` — one tree,
    // two languages, the seam exactly at the Fence.
    expect(chain(markdown, 20)).toEqual([
      "ClassName",
      "Basetype",
      "UnnamedStatement",
      "Statement",
      "StatementList",
      "Script",
      "FencedCode",
      "Document",
    ]);
  });

  it("is Pikchr itself for a .pikchr Document, whose whole text is one Script", () => {
    const pikchrDocument = state("box\narrow\n", "diagram.pikchr");

    expect(pikchrDocument.facet(languageFacet)).toBe(pikchrLanguage);
    expect(scriptsOf(pikchrDocument)).toHaveLength(1);
  });

  it("knows a Markdown Document from a Pikchr one, and from neither", () => {
    expect(isMarkdownDocument(state(markdown, "notes.md"))).toBe(true);
    expect(isMarkdownDocument(state(markdown, "diagram.pikchr"))).toBe(false);
    // An editor with no language configured at all is not Markdown.
    expect(isMarkdownDocument(EditorState.create({ doc: markdown }))).toBe(false);
  });
});

describe("Save As to a different extension", () => {
  it("reconfigures the live editor rather than building a second one", () => {
    // A .pikchr Document saved as .md: one editor throughout, its Scripts
    // re-derived from the new tree.
    const before = state("```pikchr\nbox\n```\n", "diagram.pikchr");
    expect(scriptsOf(before)[0]?.text).toBe("```pikchr\nbox\n```\n");

    const after = before.update({ effects: documentLanguageEffect("markdown") }).state;

    expect(after.facet(languageFacet)?.name).toBe("markdown");
    expect(after.doc.toString()).toBe(before.doc.toString());
    expect(scriptsOf(after)[0]?.text).toBe("box\n");
  });

  it("goes back the other way just as well", () => {
    const before = state("```pikchr\nbox\n```\n", "notes.md");
    const after = before.update({ effects: documentLanguageEffect("pikchr") }).state;

    expect(after.facet(languageFacet)).toBe(pikchrLanguage);
    expect(scriptsOf(after)[0]?.text).toBe("```pikchr\nbox\n```\n");
  });
});
