import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Image } from "@tauri-apps/api/image";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RecentList } from "./recent.js";
import { DOCUMENT_EXTENSIONS, isSupportedDocumentName } from "./supported.js";
import {
  type ClipboardPayload,
  type DocumentRef,
  DocumentUnreadableError,
  type MenuNodeSpec,
  type NativeMenu,
  type OpenDelivery,
  type OpenedDocument,
  opening,
  type Platform,
  type PlatformCapabilities,
  type PredefinedMenuItemKind,
  refusing,
  type SaveAsResult,
  type Unsubscribe,
  type WriteOutcome,
} from "./types.js";

/** What the Rust `open_path` command returns. */
interface OpenedFile {
  text: string;
  name: string;
  path: string;
}

/** Matches `open::OPEN_REQUESTED_EVENT`. */
const OPEN_REQUESTED_EVENT = "pikchard://open-requested";

const DOCUMENT_FILTERS = [{ name: "Pikchr and Markdown", extensions: [...DOCUMENT_EXTENSIONS] }];

function toOpenedDocument(file: OpenedFile): OpenedDocument {
  // On Desktop the path *is* the Identity: it is stable, and it is what Recent
  // and the Draft are keyed by.
  return {
    name: file.name,
    text: file.text,
    identity: { key: file.path, name: file.name, path: file.path },
  };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1);
}

/**
 * Pikchard as a desktop app.
 *
 * Every path that did not come from a dialog goes through the Rust
 * `open_path`, which allows and reads in one call — runtime filesystem scope is
 * in-memory and dies each launch, so a Recent entry needs re-allowing before
 * every read (#1057). Dialog-picked paths are auto-scoped by the dialog plugin
 * and would not need it, but they take the same route anyway: one read path is
 * easier to keep honest than two, and allowing an already-allowed file costs
 * nothing.
 */
export class TauriPlatform implements Platform {
  readonly kind = "desktop" as const;
  readonly capabilities: PlatformCapabilities = {
    saveInPlace: true,
    persistsRecentDocuments: true,
  };

  /** Recent lives in the webview's storage here too, per ADR 0010. */
  private readonly recent = new RecentList("pikchard.recent.desktop");
  /** Whether a close has to be answered for before the window goes. */
  private closeNeedsAnswer = false;

  async openDocument(): Promise<OpenDelivery | null> {
    const picked = await openDialog({ multiple: false, filters: DOCUMENT_FILTERS });
    if (typeof picked !== "string") return null;
    return this.deliver([picked]);
  }

  /**
   * Every route a Document enters by. Open, drop and OS "open with" all confer
   * an Identity, so all of them enter Recent (#1054) — keeping that in one
   * place is what stops a route being added later that quietly forgets to.
   */
  private adopt(file: OpenedFile): OpenedDocument {
    const opened = toOpenedDocument(file);
    if (opened.identity) this.recent.remember(opened.identity);
    return opened;
  }

  async readDocument(ref: DocumentRef): Promise<string> {
    const path = ref.path ?? ref.key;
    try {
      return (await this.read(path)).text;
    } catch (error) {
      // The desktop has no denial case — there is no permission to withhold, so
      // anything that fails here means the file can no longer be read. The
      // pruning is the caller's: a Save reads the file too (#1054).
      throw new DocumentUnreadableError("missing", `${ref.name} could not be read`, {
        cause: error,
      });
    }
  }

  async saveDocument(ref: DocumentRef, text: string): Promise<void> {
    await writeTextFile(ref.path ?? ref.key, text);
  }

  async saveDocumentAs(text: string, suggestedName: string): Promise<SaveAsResult> {
    const path = await saveDialog({ defaultPath: suggestedName, filters: DOCUMENT_FILTERS });
    if (!path) return { outcome: "cancelled" };
    await writeTextFile(path, text);
    const identity: DocumentRef = { key: path, name: nameOf(path), path };
    this.recent.remember(identity);
    return { outcome: "saved", identity };
  }

  async exportFile(suggestedName: string, produce: () => Promise<Blob>): Promise<WriteOutcome> {
    const extension = extensionOf(suggestedName);
    // The dialog before the bytes: it needs transient activation, and awaiting a
    // rasterisation first can consume it (#1055).
    const path = await saveDialog({
      defaultPath: suggestedName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (!path) return "cancelled";
    const blob = await produce();
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    // Deliberately not remembered: an Export never enters Recent (#1055).
    return "saved";
  }

  async recentDocuments(): Promise<DocumentRef[]> {
    return this.recent.list();
  }

  async forgetRecent(key: string): Promise<void> {
    this.recent.forget(key);
  }

  /**
   * arboard, the clipboard backend, has no MIME-typed entry point, so
   * `image/svg+xml` is simply unreachable here and the PNG is what goes on the
   * clipboard (#1055 Q8). Each write is a separate clipboard set, so the PNG
   * wins where both are offered.
   */
  async clipboardWrite(payload: ClipboardPayload): Promise<void> {
    if (!payload.png) return;
    const bytes = new Uint8Array(await (await payload.png).arrayBuffer());
    // `fromBytes`, not the raw constructor: raw bytes are read as RGBA.
    await writeImage(await Image.fromBytes(bytes));
  }

  /**
   * Build the menu the app described, and hand back the two ways to change it.
   *
   * The only place in Pikchard that knows what a `MenuItem` is: everything above
   * describes a menu in the app's own terms (ADR 0001), which is what lets the
   * menu's *contents* be decided and tested without a desktop at all.
   *
   * On macOS the menu belongs to the application; on Windows and Linux it belongs
   * to the window, and setting only the former leaves those two with no menu bar.
   */
  async setApplicationMenu(items: readonly MenuNodeSpec[]): Promise<NativeMenu> {
    const built = new Map<string, MenuItem | CheckMenuItem>();
    const menu = await Menu.new({ items: await buildMenuNodes(items, built) });
    await menu.setAsAppMenu();
    if (!isMacOS()) await menu.setAsWindowMenu(getCurrentWindow());
    return {
      setEnabled: (id, enabled) => void built.get(id)?.setEnabled(enabled),
      setText: (id, text) => void built.get(id)?.setText(text),
    };
  }

  /**
   * The user's own browser, through `tauri-plugin-opener` — never the app's
   * webview, which has one window and no way back (#1100).
   */
  openExternal(url: string): void {
    void openUrl(url);
  }

  setTitle(title: string): void {
    void getCurrentWindow().setTitle(title);
  }

  /**
   * Whether closing needs an answer first. Held rather than acted on: the close
   * is always intercepted, and this is what decides whether the interception
   * asks the user or simply lets the window go.
   */
  preventClose(prevent: boolean): void {
    this.closeNeedsAnswer = prevent;
  }

  /**
   * The close the user asked for, held back for a Prompt.
   *
   * `onCloseRequested` covers Windows, Linux and the macOS red close button.
   * macOS **Cmd+Q does not reach here** — `ExitRequested` does not fire on the
   * NSApp `terminate:` path (tauri-apps/tauri#9198), so #1054 budgets a custom
   * `Quit` menu item to replace the predefined one, which means hand-building
   * the whole macOS app submenu. That submenu is the native menu bar's to build
   * (#1023); until it exists, Cmd+Q and Dock ▸ Quit both fall back to the
   * Draft, which is what the focus-loss flush is for.
   */
  onCloseRequested(callback: () => void): Unsubscribe {
    let stop: (() => void) | null = null;
    let stopped = false;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (!this.closeNeedsAnswer) return;
        event.preventDefault();
        callback();
      })
      .then((unlisten) => {
        if (stopped) unlisten();
        else stop = unlisten;
      });
    return () => {
      stopped = true;
      stop?.();
      stop = null;
    };
  }

  /**
   * The window losing focus — including the app being deactivated, which is the
   * last thing that happens before macOS Cmd+Q takes the process (#1054).
   *
   * The window's own event rather than the DOM's `blur`: `onFocusChanged` is
   * what Tauri documents for it, and it does not depend on the webview
   * forwarding an OS-level deactivation as a DOM event.
   */
  onFocusLost(callback: () => void): Unsubscribe {
    let stop: (() => void) | null = null;
    let stopped = false;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) callback();
      })
      .then((unlisten) => {
        if (stopped) unlisten();
        else stop = unlisten;
      });
    return () => {
      stopped = true;
      stop?.();
      stop = null;
    };
  }

  /**
   * `destroy`, not `close`: `close` would run the close handler above again and
   * be held back by it a second time.
   */
  async closeWindow(): Promise<void> {
    await getCurrentWindow().destroy();
  }

  async takeLaunchDelivery(): Promise<OpenDelivery | null> {
    return this.deliver(await invoke<string[]>("take_open_paths"));
  }

  /**
   * Two sources, both native. With `dragDropEnabled` the DOM `drop` event never
   * fires for OS files — wry suppresses it on macOS and Linux and replaces the
   * WebView2 handler on Windows — so this must never use HTML5 events (#1041).
   */
  onOpenRequested(callback: (delivery: OpenDelivery) => void): Unsubscribe {
    const stops: Array<() => void> = [];
    let stopped = false;
    const collect = (stop: () => void) => {
      if (stopped) stop();
      else stops.push(stop);
    };
    const announce = (paths: string[]) => {
      void this.deliver(paths).then((delivery) => {
        if (delivery) callback(delivery);
      });
    };

    void listen<string[]>(OPEN_REQUESTED_EVENT, (event) => announce(event.payload)).then(collect);

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        announce(event.payload.paths);
      })
      .then(collect);

    return () => {
      stopped = true;
      for (const stop of stops) stop();
      stops.length = 0;
    };
  }

  /**
   * Paths from the OS, as a delivery: the first one, and how many came.
   *
   * The judgement is made on the path's Name and before `open_path` is called,
   * so a dropped `.pdf` is refused rather than read — which is also why Rust
   * hands over paths rather than contents (#1018).
   *
   * A path that cannot be read at all is not a refusal and gets no Toast: the
   * user chose a file, and being told about one they never chose — or about a
   * race between the double-click and the read — explains nothing. It is logged
   * and dropped, which is what the Rust side used to do with it.
   */
  private async deliver(paths: string[]): Promise<OpenDelivery | null> {
    const path = paths[0];
    if (path === undefined) return null;
    const name = nameOf(path);
    if (!isSupportedDocumentName(name)) return refusing(name, paths.length);
    try {
      return opening(this.adopt(await this.read(path)), paths.length);
    } catch (error) {
      console.error(`Could not read ${path}`, error);
      return null;
    }
  }

  private read(path: string): Promise<OpenedFile> {
    return invoke<OpenedFile>("open_path", { path });
  }
}

function nameOf(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator === -1 ? path : path.slice(separator + 1);
}

/** muda's names for the predefined items, which are not ours. */
const PREDEFINED: Record<
  PredefinedMenuItemKind,
  "Cut" | "Copy" | "Paste" | "SelectAll" | "Hide" | "HideOthers" | "ShowAll"
> = {
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "SelectAll",
  hide: "Hide",
  hideOthers: "HideOthers",
  showAll: "ShowAll",
};

/**
 * The described menu, as Tauri's own objects — and every item with an id recorded
 * in `built`, because that is what the app's diff pushes to afterwards.
 */
async function buildMenuNodes(
  items: readonly MenuNodeSpec[],
  built: Map<string, MenuItem | CheckMenuItem>,
): Promise<Array<MenuItem | CheckMenuItem | PredefinedMenuItem | Submenu>> {
  const made: Array<MenuItem | CheckMenuItem | PredefinedMenuItem | Submenu> = [];
  for (const node of items) {
    switch (node.kind) {
      case "separator":
        made.push(await PredefinedMenuItem.new({ item: "Separator" }));
        break;
      case "predefined":
        made.push(await PredefinedMenuItem.new({ item: PREDEFINED[node.item] }));
        break;
      case "submenu":
        made.push(
          await Submenu.new({ text: node.text, items: await buildMenuNodes(node.items, built) }),
        );
        break;
      case "item": {
        const common = {
          id: node.id,
          text: node.text,
          enabled: node.enabled ?? true,
          ...(node.accelerator ? { accelerator: node.accelerator } : {}),
          action: node.action,
        };
        const item =
          node.checked === undefined
            ? await MenuItem.new(common)
            : await CheckMenuItem.new({ ...common, checked: node.checked });
        built.set(node.id, item);
        made.push(item);
        break;
      }
    }
  }
  return made;
}

/** macOS hangs the menu off the application; the other two off the window. */
function isMacOS(): boolean {
  return /mac/i.test(globalThis.navigator?.userAgent ?? "");
}
