import { registerSW } from "virtual:pwa-register";
import type { EditorView } from "@codemirror/view";
import { loadPikchr } from "@pikchard/pikchr-wasm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commandKeymap, useCommandShortcuts } from "./commands/dispatch.js";
import { MENUS } from "./commands/menus.js";
import type { CommandContext } from "./commands/registry.js";
import { COPY } from "./copy.js";
import { scriptsOf } from "./document/scripts.js";
import { useDocumentSession } from "./document/session.js";
import { insertFence } from "./editor/commands.js";
import type { EditorDiagnostic } from "./editor/diagnostics.js";
import type { CursorPosition } from "./editor/Editor.js";
import { Editor } from "./editor/Editor.js";
import { selectStatement } from "./editor/statement.js";
import { EXAMPLES } from "./examples/examples.js";
import { useExportCommands } from "./export/commands.js";
import { HomeScreenHint, isIosSafari } from "./offline/home-screen-hint.js";
import { watchForUpdates } from "./offline/updates.js";
import { createPlatform, detectPlatformKind } from "./platform/index.js";
import { webStorage } from "./platform/storage.js";
import { objectAt } from "./preview/hit.js";
import { Preview } from "./preview/Preview.js";
import { usePanZoom, zoomPercent } from "./preview/panzoom.js";
import { documentSpan, errorPosition } from "./render/position.js";
import { type PresentedError, usePresentedError } from "./render/presentation.js";
import { isLong, scriptFromHash, shareLink } from "./share/link.js";
import { About } from "./shell/About.js";
import { DocumentTitle } from "./shell/DocumentTitle.js";
import { Gutter } from "./shell/Gutter.js";
import { MenuBar } from "./shell/MenuBar.js";
import { useNativeMenu } from "./shell/native-menu.js";
import { Prompt } from "./shell/Prompt.js";
import { RestorePrompt } from "./shell/RestorePrompt.js";
import { StatusBar } from "./shell/StatusBar.js";
import { useSplit } from "./shell/split.js";
import { Toasts } from "./shell/Toast.js";
import { Toolbar } from "./shell/Toolbar.js";
import { useThemePreference } from "./shell/theme-preference.js";
import { useStore } from "./store.js";
import { DailyUpdateCheck } from "./updates/daily.js";
import { githubReleases, type UpdateChecker } from "./updates/releases.js";
import { APP_VERSION, REPOSITORY_URL, WEB_APP_URL } from "./version.js";

const platformKind = detectPlatformKind();

// Chosen once, at startup, as ADR 0001 says — the desktop import is async, so
// what module scope holds is the promise and not the Platform. Nothing awaits
// it until the user asks for a file operation, by which time it has long
// resolved.
const platform = createPlatform();

// The service worker, registered once for the page rather than per render: a
// new version waits until the user takes it (#1025). On the desktop this is a
// stub that never registers (`vite.config.ts`).
const updates = watchForUpdates(registerSW);

// Check for Updates (#1035). The web build asks its service worker; the
// desktop, which has none, asks GitHub for the latest release.
const updateChecker: UpdateChecker =
  platformKind === "desktop" ? githubReleases(REPOSITORY_URL, APP_VERSION) : updates;

/** "Pikchard X is available", with the way to it — for both checks (#1035). */
const offerUpdate = (found: { readonly version: string; readonly url: string }) =>
  useStore.getState().showToast(COPY.updateAvailable(found.version), {
    action: {
      label: COPY.download,
      run: () => void platform.then((host) => host.openExternal(found.url)),
    },
  });

// The desktop also looks by itself, at most once a day (#1035); the web build's
// service worker already looks on every load.
const dailyUpdates =
  platformKind === "desktop"
    ? new DailyUpdateCheck(updateChecker, offerUpdate, webStorage())
    : null;

/** How long after launch the daily check waits, so it never competes with startup. */
const DAILY_CHECK_DELAY_MS = 5000;

/**
 * Where a share link points (#1032): the page itself on the web, so a fork or
 * the dev server shares its own links; the public web app from the desktop,
 * which has no address of its own.
 */
const shareBase = () =>
  platformKind === "desktop" ? WEB_APP_URL : `${window.location.origin}${window.location.pathname}`;

// Due once, on iOS Safari only, the first time unsaved work is kept (#1025).
const homeScreenHint = new HomeScreenHint(isIosSafari(globalThis.navigator));

export function App() {
  const document = useStore((state) => state.document);
  const unsaved = useStore((state) => state.unsaved);
  const recent = useStore((state) => state.recent);
  const toasts = useStore((state) => state.toasts);
  const dismissToast = useStore((state) => state.dismissToast);
  const scripts = useStore((state) => state.scripts);
  const publishScripts = useStore((state) => state.publishScripts);
  const theme = useStore((state) => state.theme);
  const themeChoice = useStore((state) => state.themeChoice);
  const chooseTheme = useStore((state) => state.chooseTheme);
  const render = useStore((state) => state.render);
  const renderer = useStore((state) => state.renderer);
  const attachRenderer = useStore((state) => state.attachRenderer);
  const view = useRef<EditorView | null>(null);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, col: 1 });
  /** The statement the cursor is in, as its `data-pik` offset (#1029). */
  const [statement, setStatement] = useState<number | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Open, Save, Save As, Recent, the Draft and every Prompt — the text stays
  // in the editor, and the session reads it from here when it needs it.
  const session = useDocumentSession({
    platform,
    editorState: useCallback(() => view.current?.state ?? null, []),
    onDraftWritten: useCallback(() => {
      if (homeScreenHint.take())
        useStore.getState().showToast(COPY.homeScreenHint, { lingers: true });
    }, []),
  });

  // A new version is waiting: say so, and reload onto it only when asked —
  // with the work kept and nothing asking about leaving (#1025).
  const prepareReload = useRef(session.prepareReload);
  prepareReload.current = session.prepareReload;
  useEffect(() => {
    // Offered again if the reload fails, rather than leaving the user with a
    // dismissed Toast and no way left to take the update.
    const offer = (apply: () => Promise<void>) =>
      useStore.getState().showToast(COPY.updateReady, {
        action: {
          label: COPY.reload,
          run: () =>
            void prepareReload
              .current()
              .then(apply)
              .catch((failure: unknown) => {
                console.error("Update failed", failure);
                offer(apply);
              }),
        },
      });
    return updates.onReady(offer);
  }, []);

  // Export SVG, Export PNG and Copy Diagram, all three acting on the last-good
  // Diagram (#1021).
  const exports = useExportCommands({ platform });

  const diagram = render.lastGood?.diagram ?? null;
  // The Diagram's size, stable while the bounding box is: what auto-fit keys
  // on, so most keystrokes do not jerk the viewport under the cursor (#1086).
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the size, not the Diagram — see above
  const size = useMemo(
    () => (diagram ? { width: diagram.width, height: diagram.height } : null),
    [diagram?.width, diagram?.height],
  );
  // A click on the Diagram, as opposed to a pan. Its handler needs the split
  // and the editor, which come later, so it is read through a ref.
  const diagramClick = useRef<(x: number, y: number) => void>(() => {});
  const panzoom = usePanZoom(size, (x, y) => diagramClick.current(x, y));
  const diagramElement = useRef<HTMLDivElement>(null);

  // The editor/Preview split: a width that is remembered, and a Command that
  // collapses it (#1023).
  const split = useSplit();

  /**
   * Take the cursor into Script `index` (#1019).
   *
   * The Spans come from the editor's own state rather than from the store: the
   * store holds the *projection*, which carries only the Active Script's Span,
   * and giving it every Span so the status bar could jump would be a second copy
   * of the Document's structure for one click's sake (ADR 0008).
   *
   * The cursor goes to the Script's start, which makes it Active — the tint, the
   * Render and the selector's own label all follow from the cursor and are never
   * set by hand.
   */
  const jumpToScript = useCallback((index: number) => {
    const editor = view.current;
    if (!editor) return;
    const script = scriptsOf(editor.state)[index];
    if (!script) return;
    editor.dispatch({ selection: { anchor: script.span.from }, scrollIntoView: true });
    editor.focus();
  }, []);

  /**
   * Show or hide the editor, taking the keyboard along (#1023, #1101).
   *
   * Hidden, the editor is out of the tab order — so if the keyboard was *in* it,
   * the next keystrokes would go nowhere anyone can see. Focus moves to the
   * button that brings the editor back, and showing it again puts focus back in
   * the editor, which is what the user asked to see.
   *
   * Decided here, at the moment of toggling, because by the time the pane is
   * hidden the browser has already blurred it and the fact is gone.
   */
  const refocus = useRef<"editor" | "toggle" | null>(null);
  const toggleEditor = useCallback(() => {
    if (split.editorVisible) refocus.current = view.current?.hasFocus ? "toggle" : null;
    else refocus.current = "editor";
    split.toggleEditor();
  }, [split.editorVisible, split.toggleEditor]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per toggle, after the pane has changed
  useEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    if (target === "editor") view.current?.focus();
    if (target === "toggle") {
      window.document.querySelector<HTMLElement>("[data-command='toggleEditor']")?.focus();
    }
  }, [split.editorVisible]);

  /**
   * Select the statement behind the Object under a click on the Diagram (#1029).
   *
   * The Diagram's offsets index the Script it was rendered from, so they only
   * mean anything while that is still the Active Script's text. A Diagram kept
   * through a Render Error, or one the user has typed past, is older than the
   * Script — and a click on it selects nothing rather than the wrong thing.
   */
  diagramClick.current = (x, y) => {
    const editor = view.current;
    const diagram = diagramElement.current;
    if (!editor || !diagram) return;
    const { render, scripts } = useStore.getState();
    if (!scripts.span || render.lastGood?.script !== scripts.text) return;
    const offset = objectAt(diagram, x, y);
    if (offset === null) return;
    // The point is to see the code, so a hidden editor comes back to show it.
    if (!split.editorVisible) toggleEditor();
    selectStatement(editor, scripts.span.from + offset);
  };

  useEffect(() => {
    if (!dailyUpdates) return;
    const waiting = setTimeout(() => void dailyUpdates.run(), DAILY_CHECK_DELAY_MS);
    return () => clearTimeout(waiting);
  }, []);

  // A share link opens its Script as an Untitled Document (#1032) — on load, and
  // when a link is followed into an open tab. Through the Examples' own path,
  // so unsaved work is asked about first. The fragment goes either way: a
  // reload must not open the link again over whatever came after it.
  const openShared = session.openExample;
  useEffect(() => {
    if (platformKind !== "browser") return;
    const follow = () => {
      const shared = scriptFromHash(window.location.hash);
      if (shared === null) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (shared.kind === "broken") useStore.getState().showToast(COPY.cannotOpenLink);
      // The name is never shown: like an Example's, it opens as Untitled.
      else void openShared({ name: "shared link", script: shared.script });
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [openShared]);

  const openExternal = useCallback((url: string) => {
    void platform.then((host) => host.openExternal(url));
  }, []);

  /**
   * The context every Command reads, rebuilt on each render because most of what
   * it holds *is* the render — `editorVisible`, the theme, what has rendered.
   *
   * The store is a getter rather than a value: a Command invoked from the native
   * menu runs long after the menu was built, and it must act on what is true then.
   */
  const ctx = useMemo<CommandContext>(
    () => ({
      state: () => useStore.getState(),
      session,
      exports,
      panzoom,
      editor: () => view.current,
      jumpToScript,
      toggleEditor,
      openExternal,
      showAbout: () => setAboutOpen(true),
      checkForUpdates: () =>
        void updateChecker.check().then((found) => {
          const { showToast } = useStore.getState();
          if (found.kind === "current") showToast(COPY.upToDate);
          if (found.kind === "failed") showToast(COPY.cannotCheckForUpdates);
          if (found.kind === "available") {
            // Shown now, so the daily check does not offer it again.
            dailyUpdates?.shown(found.version);
            offerUpdate(found);
          }
          // "waiting": the update Toast is already up, and says it better.
        }),
      copyLink: () =>
        void (async () => {
          const { scripts, showToast } = useStore.getState();
          if (scripts.activeIndex === null) return;
          const link = shareLink(shareBase(), scripts.text);
          try {
            await (await platform).clipboardWrite({ text: link });
            showToast(isLong(link) ? COPY.longLinkCopied : COPY.linkCopied);
          } catch (failure) {
            console.error("Copy failed", failure);
            showToast(COPY.cannotCopyLink);
          }
        })(),
      editorVisible: split.editorVisible,
    }),
    [session, exports, panzoom, jumpToScript, toggleEditor, split.editorVisible, openExternal],
  );

  // Read through a ref by the keyboard, whose listeners are registered once.
  const latestCtx = useRef(ctx);
  latestCtx.current = ctx;
  const readCtx = useCallback(() => latestCtx.current, []);

  // Every Shortcut in the table, outside the editor; inside it, the keymap
  // extension below has them at higher precedence than CodeMirror's own (#1053).
  useCommandShortcuts(readCtx, platformKind);
  const keymap = useMemo(() => commandKeymap(readCtx, platformKind), [readCtx]);

  // The desktop's own menu bar, from the same `MENUS` the web dropdowns use.
  useNativeMenu({
    platform,
    ctx,
    recent,
    examples: EXAMPLES,
    themeChoice,
    onOpenRecent: session.openRecent,
    onOpenExample: session.openExample,
    onChooseTheme: chooseTheme,
    onQuit: session.requestClose,
  });

  // Insert Pikchr Diagram has no Shortcut in v1 (#1053): the empty-Preview
  // hint is one of the three places it is reached from.
  const addFence = useCallback(() => {
    const editor = view.current;
    if (!editor) return;
    insertFence(editor);
    editor.focus();
  }, []);

  // Loading the WASM module is the one genuinely async thing left in the
  // Render path; every Render after this is synchronous (#1086).
  useEffect(() => {
    let cancelled = false;
    loadPikchr().then((loaded) => {
      if (!cancelled) attachRenderer(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [attachRenderer]);

  // The store's error is always current; this is the one the app may *show*.
  const presented = usePresentedError(render.error, scripts.text, scripts.activeIndex);
  const error = useMemo<PresentedError | null>(
    () =>
      presented
        ? { message: presented.message, position: errorPosition(scripts, presented) }
        : null,
    [presented, scripts],
  );
  const diagnostic = useMemo<EditorDiagnostic | null>(() => {
    if (!presented) return null;
    const span = documentSpan(scripts, presented);
    return span === null ? null : { span, message: presented.message };
  }, [presented, scripts]);

  const jumpToError = useCallback(() => {
    const editor = view.current;
    if (!editor || !diagnostic) return;
    editor.dispatch({ selection: { anchor: diagnostic.span.from }, scrollIntoView: true });
    editor.focus();
  }, [diagnostic]);

  // The kept choice, the page's `data-theme` and `prefers-color-scheme`, all
  // session long (#1022). The first paint's theme is `index.html`'s.
  useThemePreference();

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__title">Pikchard</span>
        {/* Web only: on the desktop the native menu bar carries these (#1047). */}
        <MenuBar
          menus={MENUS}
          kind={platformKind}
          ctx={ctx}
          recent={recent}
          showsRecent={session.showsRecent}
          examples={EXAMPLES}
          themeChoice={themeChoice}
          onOpenRecent={session.openRecent}
          onOpenExample={session.openExample}
          onChooseTheme={chooseTheme}
        />
        <DocumentTitle name={document.name} unsaved={unsaved} />
        <Toolbar ctx={ctx} zoom={zoomPercent(panzoom.viewport)} />
      </header>

      <main
        className="app__split"
        data-editor-hidden={!split.editorVisible}
        // Hidden, the gutter's column closes too: its 6 px would otherwise be a
        // stripe down the side of a Preview that is meant to be full-width.
        style={{
          gridTemplateColumns: split.editorVisible
            ? `${split.editorWidth}px auto 1fr`
            : "0px 0px 1fr",
        }}
      >
        <Editor
          document={document}
          diagnostic={diagnostic}
          extensions={keymap}
          onScripts={publishScripts}
          onEdit={session.noteEdit}
          onCursor={setCursor}
          onStatement={setStatement}
          onView={(mounted) => {
            view.current = mounted;
          }}
        />
        <Gutter onDrag={split.dragTo} onReset={split.reset} />
        <Preview
          diagram={diagram}
          error={error}
          hasScripts={scripts.activeIndex !== null}
          panzoom={panzoom}
          onInsertDiagram={addFence}
          diagramRef={diagramElement}
          // Only while the Diagram is the Script's own: an older one's offsets
          // would light up whatever now sits where the statement used to start.
          highlight={render.lastGood?.script === scripts.text ? statement : null}
        />
      </main>

      <StatusBar
        cursor={cursor}
        theme={theme}
        elapsedMs={render.elapsedMs}
        error={error}
        panzoom={panzoom}
        scripts={scripts}
        onJumpToError={jumpToError}
        onJumpToScript={jumpToScript}
      />

      <Prompt pending={session.prompt.pending} />
      <RestorePrompt
        drafts={session.restorable}
        onRestore={session.restore}
        onDiscard={session.discard}
        onDiscardAll={session.discardAll}
      />
      <About
        open={aboutOpen}
        pikchrVersion={renderer?.version ?? null}
        onClose={() => setAboutOpen(false)}
        onOpenRepository={() => openExternal(REPOSITORY_URL)}
      />
      <Toasts notices={toasts} onDismiss={dismissToast} />
    </div>
  );
}
