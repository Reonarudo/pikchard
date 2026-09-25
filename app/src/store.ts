import type { Renderer } from "@pikchard/pikchr-wasm";
import { create } from "zustand";
import type { Draft } from "./document/drafts.js";
import { NO_SCRIPTS, type ScriptProjection } from "./document/projection.js";
import type { EditorDocument } from "./editor/Editor.js";
import { readDocument } from "./editor/fidelity.js";
import type { DocumentRef, OpenedDocument } from "./platform/types.js";
import { NOT_RENDERED, type RenderSlice, renderScript, rerenderForTheme } from "./render/render.js";
import { type ThemeChoice, writeThemeChoice } from "./theme.js";

/**
 * The seed Script a new Document starts from (#1014 round 3, Q28): Captain
 * Picard, for Pikchard.
 *
 * Drawn back to front, since a later Object covers an earlier one, and the face
 * is placed relative to `Head`, so it doubles as a first look at Labels and
 * positions. The colours are for the light theme: Pikchr's dark mode inverts
 * every fill's lightness, so in the dark his skin and shoulders darken too.
 */
export const NEW_DOCUMENT_SCRIPT = `# Uniform: black shoulders, command red below
box wid 2.6 ht 1.2 rad 0.4 fill black at 0,-0.6
box wid 2.6 ht 0.72 fill 0xB22222 at 0,-0.84
# Neck and collar
box wid 0.42 ht 0.4 fill 0xE8B896 at 0,0.05
ellipse wid 0.7 ht 0.25 fill black at 0,-0.17
# The head, what is left of the hair, and the ears
Head: ellipse wid 1.05 ht 1.35 fill 0xE8B896 at 0,0.82
ellipse wid 0.12 ht 0.4 fill 0xA8A8A8 color 0x808080 at Head.c+(-0.5,0.08)
ellipse wid 0.12 ht 0.4 fill 0xA8A8A8 color 0x808080 at Head.c+(0.5,0.08)
ellipse wid 0.18 ht 0.34 fill 0xE8B896 at Head.c+(-0.55,-0.12)
ellipse wid 0.18 ht 0.34 fill 0xE8B896 at Head.c+(0.55,-0.12)
# The face, placed on the head
line from Head.c+(-0.33,0.14) to Head.c+(-0.12,0.1) thickness 0.045
line from Head.c+(0.33,0.14) to Head.c+(0.12,0.1) thickness 0.045
ellipse wid 0.14 ht 0.08 fill white at Head.c+(-0.22,0.02)
ellipse wid 0.14 ht 0.08 fill white at Head.c+(0.22,0.02)
circle rad 0.03 fill black at Head.c+(-0.22,0.02)
circle rad 0.03 fill black at Head.c+(0.22,0.02)
line from Head.c+(-0.02,0.04) to Head.c+(-0.07,-0.2) to Head.c+(0.05,-0.22)
line from Head.c+(-0.15,-0.4) to Head.c+(0,-0.38) to Head.c+(0.15,-0.4)
# Combadge, and a captain's four pips
ellipse wid 0.3 ht 0.2 fill 0xD4AF37 at 0.6,-0.3
line from 0.6,-0.17 to 0.69,-0.4 to 0.6,-0.34 to 0.51,-0.4 close fill 0xC0C0C0
circle rad 0.035 fill 0xD4AF37 at -0.45,-0.1
circle rad 0.035 fill 0xD4AF37 at -0.55,-0.1
circle rad 0.035 fill 0xD4AF37 at -0.65,-0.1
circle rad 0.035 fill 0xD4AF37 at -0.75,-0.1
text "Make it so." italic at 0,-1.45
`;

/** What an Untitled Document is called — the only Name it has (#1046). */
export const UNTITLED = "Untitled";

export type Theme = "light" | "dark";

/**
 * A new, Untitled Document on the seed Script, with the cursor at the end of it.
 *
 * The seed is the whole of Pikchard's first-run experience (#1100): a Script
 * beside the Diagram it produces, and nothing to dismiss. It is the user's
 * Document the moment they type, which is why its comments only name the parts
 * of the drawing and none points at documentation — that would ship into
 * whatever they save or export.
 */
export const newDocument = (): EditorDocument => ({
  name: UNTITLED,
  fidelity: readDocument(NEW_DOCUMENT_SCRIPT),
  caret: "end",
});

/**
 * The key a Document's Draft is kept under before it has an Identity.
 *
 * Generated at the Document's birth, so two Untitled Documents in two tabs
 * never collide on one Draft (#1054).
 */
export function newDraftKey(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `untitled:${random}`;
}

/**
 * Whether this Document never had a Name at all — New, or an Example.
 *
 * Not the same as having no Identity: a Document opened in Firefox or Safari has
 * a Name and no way home, and is *not* Untitled (#1054). The Prompt that asks
 * about unsaved work is the one that cares, because it has no file to name.
 */
export function isUntitled(state: Pick<AppState, "identity" | "document">): boolean {
  return state.identity === null && state.document.name === UNTITLED;
}

/** A Toast, and which one: the same words twice over are two notices (#1100). */
export interface ToastNotice extends ToastOptions {
  readonly id: number;
  readonly message: string;
}

/**
 * What only two Toasts in the app need (#1025, #1100): the update Toast asks
 * for a decision, and the iOS Home Screen hint has more words than the usual
 * dwell can carry.
 */
export interface ToastOptions {
  /** A decision the Toast asks for. A Toast with one never goes on its own. */
  readonly action?: ToastAction;
  /** Stay for longer than the usual dwell, for words that need the time. */
  readonly lingers?: boolean;
}

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/**
 * The single app store (#1014 round 2, Q18). It grows to hold the Document,
 * the Active Script, the Render result, the theme and the layout; the
 * Platform is injected rather than stored.
 *
 * The Document's *text* is not here and never will be: `EditorState` is the
 * source of truth for it, and what the store holds is the projection the
 * editor publishes (ADR 0008).
 */
export interface AppState {
  /**
   * The Document the editor is open on: its Name, and the bytes it was opened
   * from — which are its Baseline, not a running copy of what is being typed.
   * Open (#1018) and Save As (#1020) are what replace it.
   */
  document: EditorDocument;
  /**
   * Where the Document came from, and where Save writes it back to — `null`
   * for an Untitled Document, which has nowhere to go back to yet (#1054).
   * Open (#1018) is the other thing that will set it.
   */
  identity: DocumentRef | null;
  /**
   * The Document's text as it was last opened or saved — its **Baseline**.
   *
   * Held beside `document.fidelity.text` rather than in it: the editor reads a
   * new `fidelity` object as a different Document being opened, so a Save
   * cannot move those bytes without reloading the text under the user. This is
   * the one that moves, and it is what Unsaved and the changed-underneath check
   * at Save are both judged against (#1054).
   */
  baseline: string;
  /**
   * What this Document's Draft is kept under: its Identity's key, or the id
   * generated at its birth while it has none (#1054).
   */
  draftKey: string;
  /**
   * Whether the text differs from the Baseline — decided here, from the text the
   * editor hands over on each change (`noteText`).
   *
   * The Unsaved dot is a pure function of this and of nothing else, so no Draft
   * write status ever reaches it: there is no "saving…" in Pikchard (#1054).
   */
  unsaved: boolean;
  /**
   * Recent, as the Platform last listed it. Empty where the Platform cannot
   * keep one, in which case the menu shows no Recent at all rather than an
   * empty one (#1054).
   */
  recent: DocumentRef[];
  /**
   * The Toasts on screen, oldest first. A stack rather than a slot, so a new
   * notice never replaces one the user has not read yet (#1047).
   */
  toasts: readonly ToastNotice[];
  /** The Scripts, as last published by the editor. */
  scripts: ScriptProjection;
  /**
   * What the user chose — remembered across sessions, and `system` until they
   * choose otherwise (#1022).
   */
  themeChoice: ThemeChoice;
  /**
   * What everything actually renders with: the choice, resolved. The two differ
   * only under `system`, and that is exactly why the resolved one is not what
   * gets stored — the system's answer changes while the app is running.
   */
  theme: Theme;
  /** What the last Render of the Active Script left behind (#1086). */
  render: RenderSlice;
  /**
   * The Renderer, once the WASM module has loaded — the app's one genuinely
   * async step. Held so the Render can happen inside the actions below rather
   * than in a React effect, and so the pinned pikchr version can be shown.
   */
  renderer: Renderer | null;
  /**
   * What `render` was produced from. Internal bookkeeping, and the whole of
   * the memoisation: moving the cursor or editing the prose of a large
   * Markdown Document republishes a projection whose Active Script is
   * character-for-character the same, and that must cost nothing.
   */
  renderedFor: { text: string; theme: Theme } | null;
  publishScripts(scripts: ScriptProjection): void;
  /**
   * A Document arrived from the Platform: Open, a drop, an OS "open with", or a
   * Recent entry. It replaces whatever was open, Baseline and all.
   */
  documentOpened(opened: OpenedDocument): void;
  /**
   * New: an Untitled Document on the seed, with nothing carried over from the one
   * it replaced — no Identity, no Baseline and a Draft key of its own (#1044).
   */
  documentCreated(): void;
  /**
   * A Draft was restored. The Document comes back Unsaved, against the very
   * Baseline it was Unsaved against last session — so a later Save still
   * compares the file with the text that was opened, not with the Draft.
   */
  documentRestored(draft: Draft): void;
  /**
   * The Document was written. Its Baseline becomes the text just written, which
   * is what clears Unsaved, and the Identity is the one it now lives at — the
   * same one for a Save in place, a new one for a Save As.
   *
   * It deliberately does not touch `document.fidelity`: the editor reads a new
   * `fidelity` object as a different Document being opened, which would reload
   * the text under the user. The Baseline is the field above, and this is what
   * moves it.
   *
   * A *download* never gets here — Pikchard never learns where the file went,
   * so the Document stays exactly as Unsaved as it was (#1054).
   */
  documentSaved(identity: DocumentRef, text: string): void;
  /**
   * The Document's text, as the editor now holds it — which is all the store
   * needs to know whether the Document is Unsaved.
   *
   * The text is *passed* and never kept: `EditorState` stays the single source
   * of truth for it (ADR 0008), and what survives the call is one boolean.
   */
  noteText(text: string): void;
  setRecent(recent: DocumentRef[]): void;
  showToast(message: string, options?: ToastOptions): void;
  dismissToast(id: number): void;
  /**
   * Light, dark, or the system's answer — and what to resolve `system` to, which
   * the caller passes because the store does not read the host (#1022).
   */
  chooseTheme(choice: ThemeChoice, systemIs?: Theme): void;
  /** The system changed its mind. Ignored unless the choice is to follow it. */
  systemThemeChanged(theme: Theme): void;
  /** The sun/moon button: flip light and dark, which settles the choice too. */
  toggleTheme(): void;
  /** Hand the store the Renderer, and render what is already on screen. */
  attachRenderer(renderer: Renderer): void;
}

/**
 * Move to a theme: the Diagram is made **again**, not repainted.
 *
 * pikchr inverts the strokes itself, so a Diagram belongs to one theme and a
 * change of theme is a Render (#1016). Shared by all three ways the theme moves,
 * because that re-Render is the part none of them may forget.
 */
function themed(state: AppState, theme: Theme): Partial<AppState> {
  if (theme === state.theme) return {};
  if (state.renderer === null) return { theme };
  return {
    theme,
    render: rerenderForTheme(state.renderer, state.render, theme),
    renderedFor: state.renderedFor === null ? null : { text: state.renderedFor.text, theme },
  };
}

/** Every Toast ever shown, which is what makes each one's id unique. */
let toastCount = 0;

export const useStore = create<AppState>()((set, get) => ({
  document: newDocument(),
  identity: null,
  baseline: NEW_DOCUMENT_SCRIPT,
  draftKey: newDraftKey(),
  unsaved: false,
  recent: [],
  toasts: [],
  scripts: NO_SCRIPTS,
  // `system` and light until the app resolves the real one at startup — which it
  // does before the first paint, so this pair is never what anybody sees (#1022).
  themeChoice: "system",
  theme: "light",
  render: NOT_RENDERED,
  renderer: null,
  renderedFor: null,

  // The Render happens here, in the same update as the text it is a Render of.
  // Not in an effect and not in an update listener: because the Render is
  // synchronous, doing it here makes the text and both slots move atomically,
  // so no subscriber can ever see a Script and a Render result that disagree
  // (#1086). An effect would reintroduce exactly that one-frame gap.
  publishScripts: (scripts) =>
    set((state) => {
      const { renderer, theme, renderedFor } = state;

      // A Document with no Scripts has nothing to render, and nothing to keep
      // from before: an empty Preview, not an old Diagram.
      if (renderer === null || scripts.activeIndex === null) {
        return { scripts, render: NOT_RENDERED, renderedFor: null };
      }

      // Switching Active Script is not editing: the Diagram on screen must
      // always be the Active Script's, possibly out of date, never another's.
      //
      // The count is watched as well as the index, because Script identity is
      // positional (#1042): deleting the Fence *above* the Active one leaves
      // the index where it was while making it a different Script, and
      // carrying the kept Diagram across that would show one Script's Diagram
      // beside another's text.
      const switched =
        scripts.activeIndex !== state.scripts.activeIndex || scripts.count !== state.scripts.count;
      if (!switched && renderedFor?.text === scripts.text && renderedFor.theme === theme) {
        return { scripts };
      }

      return {
        scripts,
        render: renderScript(renderer, scripts.text, theme, switched ? NOT_RENDERED : state.render),
        renderedFor: { text: scripts.text, theme },
      };
    }),

  documentOpened: (opened) => {
    const fidelity = readDocument(opened.text);
    set({
      document: { name: opened.name, fidelity },
      identity: opened.identity,
      baseline: fidelity.text,
      draftKey: opened.identity?.key ?? newDraftKey(),
      unsaved: false,
    });
  },

  documentCreated: () =>
    set({
      document: newDocument(),
      identity: null,
      baseline: NEW_DOCUMENT_SCRIPT,
      draftKey: newDraftKey(),
      unsaved: false,
    }),

  documentRestored: (draft) => {
    const fidelity = readDocument(draft.text);
    set({
      document: { name: draft.name, fidelity },
      identity: draft.identity,
      baseline: draft.baseline,
      draftKey: draft.key,
      unsaved: draft.text !== draft.baseline,
    });
  },

  documentSaved: (identity, text) =>
    set((state) => ({
      identity,
      document: { name: identity.name, fidelity: state.document.fidelity },
      baseline: text,
      // A Save As confers an Identity, and the Draft moves to its key with it.
      draftKey: identity.key,
      unsaved: false,
    })),

  noteText: (text) => set((state) => ({ unsaved: text !== state.baseline })),

  setRecent: (recent) => set({ recent }),

  // Counted rather than compared, so the same words twice over are two
  // notices: clicking a Recent entry the file of which is still missing has to
  // say so again. The id only ever grows, so a dismissed id is never reused.
  showToast: (message, options) =>
    set((state) => {
      toastCount += 1;
      return { toasts: [...state.toasts, { ...options, id: toastCount, message }] };
    }),

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  // Remembered here, where the choice is actually made, rather than in an effect
  // watching for it: an effect runs a render *later*, and the one at startup would
  // write the store's `system` default back over the choice it had just read.
  chooseTheme: (choice, systemIs) =>
    set((state) => {
      writeThemeChoice(choice);
      return {
        themeChoice: choice,
        ...themed(state, choice === "system" ? (systemIs ?? state.theme) : choice),
      };
    }),

  // Ignored under an explicit choice: the system is still free to change its
  // mind, and a user who said "dark" did not ask to be told about it.
  systemThemeChanged: (theme) =>
    set((state) => (state.themeChoice === "system" ? themed(state, theme) : {})),

  toggleTheme: () =>
    set((state) => {
      // Flipping the switch *is* a choice: there is nothing else a user could
      // mean by it, and leaving `system` in place would let the next sunset undo
      // what they just did.
      const theme: Theme = state.theme === "light" ? "dark" : "light";
      writeThemeChoice(theme);
      return { themeChoice: theme, ...themed(state, theme) };
    }),

  attachRenderer: (renderer) => {
    const { scripts, theme } = get();
    set({
      renderer,
      ...(scripts.activeIndex === null
        ? {}
        : {
            render: renderScript(renderer, scripts.text, theme, NOT_RENDERED),
            renderedFor: { text: scripts.text, theme },
          }),
    });
  },
}));
