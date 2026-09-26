/**
 * The language of a Document, chosen by its Name alone (ADR 0008).
 *
 * `.md` and `.markdown` are Markdown with Pikchr nested into their Fences;
 * everything else — `.pikchr`, `.pik`, Untitled, a `.txt` someone is writing
 * a diagram in — is Pikchr directly. No content sniffing and no manual mode
 * switch: a Document that looks like Markdown but is named `.pikchr` is one
 * Script whose text happens to contain backticks, and that is a rule a user
 * can hold in their head.
 */

import { markdown } from "@codemirror/lang-markdown";
import { language } from "@codemirror/language";
import { Compartment, type EditorState, type Extension, type StateEffect } from "@codemirror/state";
import { pikchr, pikchrLanguage } from "@pikchard/lang-pikchr";
import { isPikchrInfoString } from "../document/fences.js";

/** The two languages a Document can be edited in. */
export type DocumentLanguage = "markdown" | "pikchr";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

/**
 * The language implied by a Document's Name.
 *
 * The extension is the last dot-separated part, and only when something
 * precedes it — `.md` on its own is a dotfile called `.md`, not a Markdown
 * Document, and `archive.md.bak` is a backup of one rather than one.
 */
export function languageForName(name: string): DocumentLanguage {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return MARKDOWN_EXTENSIONS.has(extension) ? "markdown" : "pikchr";
}

/**
 * The language extension itself.
 *
 * The Markdown case nests Pikchr through `codeLanguages`, using the same
 * predicate the Script list uses — one predicate, so what is highlighted and
 * what is rendered can never disagree. The prose around a Fence stays
 * Markdown-highlighted and fully editable; it is never Pikchr.
 */
const markdownSupport = markdown({
  codeLanguages: (info) => (isPikchrInfoString(info) ? pikchrLanguage : null),
});

export function languageExtension(kind: DocumentLanguage): Extension {
  return kind === "pikchr" ? pikchr() : markdownSupport;
}

/**
 * The compartment the language lives in, so Save As to a different extension
 * reconfigures the editor that is already open (#1085) instead of tearing it
 * down. One editor over the whole Document, always — and one across its whole
 * life.
 *
 * A module-level compartment rather than one per component, because there is
 * exactly one Editor: that is the decision #1085 is, not an assumption this
 * module happens to make.
 */
export const documentLanguage = new Compartment();

/** Switch the live editor to a language. */
export function documentLanguageEffect(kind: DocumentLanguage): StateEffect<unknown> {
  return documentLanguage.reconfigure(languageExtension(kind));
}

/**
 * Whether the Document being edited is Markdown — the question "can this
 * Document hold a Fence at all?".
 *
 * Asked of the editor's own configuration rather than of the Document's Name,
 * so it is right even in the instant between a Save As and the reconfigure
 * that follows it. `languageForName` answers the other question: what the
 * language *should* be.
 *
 * Positively, against the one Markdown language this module configures: an
 * editor with no language at all is not a Markdown Document.
 */
export function isMarkdownDocument(state: EditorState): boolean {
  return state.facet(language) === markdownSupport.language;
}
