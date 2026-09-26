/**
 * The Editor: one CodeMirror 6 `EditorView` over the whole Document (#1085,
 * ADR 0008).
 *
 * One editor, always — never one per Script, and never a separate editor for
 * the prose. Everything that varies about a Document is a compartment on this
 * one view, so opening a file, or saving it under another extension,
 * reconfigures the editor that is already there rather than building a second.
 */

import { defaultKeymap, history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { EditorState as State } from "@codemirror/state";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import {
  projectScripts,
  publishProjection,
  type ScriptProjection,
} from "../document/projection.js";
import { scripts } from "../document/scripts.js";
import { bracketEditing } from "./brackets.js";
import { type EditorDiagnostic, renderErrorDiagnostics } from "./diagnostics.js";
import { type DocumentFidelity, fidelityExtension } from "./fidelity.js";
import {
  documentLanguage,
  documentLanguageEffect,
  languageExtension,
  languageForName,
} from "./language.js";
import { activeScriptTint, editorTheme } from "./theme.js";

/** The Document the editor is opened on. */
export interface EditorDocument {
  /** The Document's Name — what decides its language, and nothing else. */
  readonly name: string;
  /** Its text, and the facts about its bytes, from `readDocument`. */
  readonly fidelity: DocumentFidelity;
  /**
   * Where the cursor waits when this Document is opened. The top for a file that
   * came from somewhere — reading starts there — and the end for the seed a New
   * Document is made of, which the user is about to type after (#1044).
   *
   * `"end"` also **takes focus**, because that is what it means: the Document was
   * made for typing into, and New is invoked from a menu that has just handed
   * focus back to its own button.
   */
  readonly caret?: "start" | "end";
}

export interface EditorProps {
  readonly document: EditorDocument;
  /** Called whenever the Scripts or the Active Script change. */
  readonly onScripts: (projection: ScriptProjection) => void;
  /** Handed the view on mount, and `null` on unmount (the Command registry). */
  readonly onView?: (view: EditorView | null) => void;
  /**
   * The Document's text changed — every change, not only the ones that move a
   * Script. Unsaved and the Draft are facts about the whole Document, so the
   * projection is not enough: editing the prose between two Fences publishes
   * nothing and still leaves the file Unsaved (#1020).
   */
  readonly onEdit?: () => void;
  /**
   * The Render Error to underline, in Document offsets, once it may be
   * presented — the caller holds it back while the user is still typing
   * (#1017).
   */
  readonly diagnostic?: EditorDiagnostic | null;
  /**
   * Where the cursor is, for the status bar (#1023). Published separately from the
   * projection, and deliberately: a cursor move inside one Script changes no Script
   * and must not look to the rest of the app as though one had changed.
   */
  readonly onCursor?: (position: CursorPosition) => void;
  /**
   * Extensions the shell adds, in practice the Command keymap (#1053). Read once,
   * at construction: the Commands behind it are read through a ref, so the keymap
   * itself never needs to change.
   */
  readonly extensions?: Extension;
}

/** The cursor, counting from one, the way an editor's status bar counts. */
export interface CursorPosition {
  readonly line: number;
  readonly col: number;
}

function cursorOf(state: State): CursorPosition {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}

/** The line ending, which only changes when a different Document is opened. */
const fidelity = new Compartment();

export function Editor({
  document,
  onScripts,
  onView,
  onEdit,
  onCursor,
  extensions,
  diagnostic = null,
}: EditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** The Document the view is currently configured for. */
  const applied = useRef<EditorDocument | null>(null);

  // The callbacks are read through a ref so a new function identity from the
  // parent never tears the editor down and takes the undo history with it.
  const publish = useRef(onScripts);
  publish.current = onScripts;
  const edited = useRef(onEdit);
  edited.current = onEdit;
  const moved = useRef(onCursor);
  moved.current = onCursor;

  // One view for the life of the component: the Document it opens on is only
  // the *initial* state, and every later Document is applied by the effect
  // below, on this same view. Re-running this effect would be exactly the
  // "one editor per Document" that #1085 rules out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate — see above
  useEffect(() => {
    if (!parent.current) return;

    const created = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: document.fidelity.text,
        extensions: [
          // The app's own Shortcuts, at higher precedence than CodeMirror's own
          // keymaps below (#1053).
          ...(extensions ? [extensions] : []),
          // `history()` is not optional: its `beforeinput` handler is what
          // stops the desktop Edit ▸ Undo item and the WKWebView context menu
          // from running WebKit's own DOM undo inside the editor, which
          // CodeMirror would then read as a fresh edit (#1053).
          history(),
          drawSelection(),
          // `lang-pikchr` declares `indentOnInput` in its language data; this
          // is the extension that acts on it.
          indentOnInput(),
          // Ahead of the keymaps below, which is the precedence the Backspace
          // binding in there needs (#1015).
          bracketEditing,
          // No `searchKeymap`: Mod+F stays the browser's find in v1 (#1053).
          keymap.of([...standardKeymap, ...defaultKeymap, ...historyKeymap]),
          // CodeMirror's own token palette for now. The Diagram and the app
          // chrome follow the theme; matching the *tokens* to it is #1022.
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          fidelity.of(fidelityExtension(document.fidelity)),
          documentLanguage.of(languageExtension(languageForName(document.name))),
          scripts(),
          // The gutter marker for the Render Error. The Diagnostic itself is
          // dispatched from outside, by the effect below, because a Render is
          // not something the editor can ask for.
          lintGutter(),
          activeScriptTint,
          editorTheme,
          EditorView.lineWrapping,
          publishProjection((projection) => publish.current(projection)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) edited.current?.();
            if (update.docChanged || update.selectionSet) moved.current?.(cursorOf(update.state));
          }),
        ],
      }),
    });

    view.current = created;
    applied.current = document;
    onView?.(created);
    // Opening is not an update — nothing changed, and yet everything did — so
    // the update listener will not fire and the first projection is announced
    // by hand.
    publish.current(projectScripts(created.state));
    moved.current?.(cursorOf(created.state));
    // The editor takes focus at startup (#1101 guard 6): it puts the chrome's
    // fifteen-odd tab stops behind Shift+Tab, which is where an editor-first app
    // wants them, and it means the first thing typed lands in the Script. A Prompt
    // shown at launch — the Restore list — takes focus from here and `<dialog>`
    // gives it back.
    created.focus();

    return () => {
      onView?.(null);
      created.destroy();
      view.current = null;
      applied.current = null;
    };
  }, []);

  // A different Document — Open, or an Example — becomes new text and a new
  // configuration on the same view. Save As to a different extension is the
  // same path with the text unchanged: only the language is reconfigured, so
  // the Scripts are re-derived from the new tree without the Document being
  // reloaded under the user.
  useEffect(() => {
    const current = view.current;
    if (!current || applied.current === document) return;

    // By identity, not by text: opening a different file that happens to hold
    // the same bytes is still an open, and Save As — which keeps the very
    // same bytes — is still only a rename.
    const opened = applied.current?.fidelity !== document.fidelity;
    applied.current = document;

    current.dispatch({
      ...(opened
        ? {
            changes: { from: 0, to: current.state.doc.length, insert: document.fidelity.text },
            selection: { anchor: document.caret === "end" ? document.fidelity.text.length : 0 },
          }
        : {}),
      effects: [
        ...(opened ? [fidelity.reconfigure(fidelityExtension(document.fidelity))] : []),
        documentLanguageEffect(languageForName(document.name)),
      ],
    });
    // A Document made for typing takes the focus with it; one opened from a file
    // does not, so Open leaves the keyboard wherever the user had it.
    if (document.caret === "end") current.focus();
    publish.current(projectScripts(current.state));
  }, [document]);

  // The Render Error, underlined where it happened. It is dispatched rather
  // than configured because it comes from a Render, which is not something the
  // editor's own state can produce — and it is dispatched only when the error
  // changes, so an unchanged underline costs no transaction.
  useEffect(() => {
    const current = view.current;
    if (!current) return;
    current.dispatch(
      setDiagnostics(current.state, renderErrorDiagnostics(current.state, diagnostic)),
    );
  }, [diagnostic]);

  return <div className="app__editor" data-testid="editor" ref={parent} />;
}
