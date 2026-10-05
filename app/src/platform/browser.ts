import { type HandleStore, IndexedDbHandleStore } from "./handle-store.js";
import { DOTTED_DOCUMENT_EXTENSIONS, isSupportedDocumentName } from "./supported.js";
import {
  type ClipboardPayload,
  type DocumentRef,
  DocumentUnreadableError,
  type OpenDelivery,
  type OpenedDocument,
  opening,
  type Platform,
  type PlatformCapabilities,
  refusing,
  type SaveAsResult,
  type Unsubscribe,
  type WriteOutcome,
} from "./types.js";

/**
 * The File System Access surface Pikchard uses. The DOM lib types the handles
 * but not the pickers or the permission methods, which are still a WICG draft.
 */
interface FilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}
interface PermissionOptions {
  mode: "read" | "readwrite";
}
type PermissionHandle = FileSystemFileHandle & {
  queryPermission?(options: PermissionOptions): Promise<PermissionState>;
  requestPermission?(options: PermissionOptions): Promise<PermissionState>;
};
interface FileSystemAccess {
  showOpenFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle>;
}

/** Documents Chromium hands a PWA at launch, through the Launch Handler API. */
interface LaunchParams {
  files?: FileSystemFileHandle[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

const DOCUMENT_TYPES = [
  {
    description: "Pikchr and Markdown",
    accept: {
      "text/markdown": [".md", ".markdown"],
      "text/x-pikchr": [".pikchr", ".pik"],
      "text/plain": [".txt"],
    },
  },
];

/**
 * How long startup waits for Chromium's launch consumer before deciding no
 * file is inbound. Long enough for the consumer it does fire during load, short
 * enough not to hold the Restore list up on an ordinary launch.
 */
const LAUNCH_SETTLE_MS = 150;

/** Cancelling a picker is an `AbortError`, which is an answer and not a failure. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isMissing(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export interface BrowserPlatformOptions {
  handles?: HandleStore;
  /** Defaults to `globalThis`; injected so a test can present or withhold the API. */
  scope?: typeof globalThis;
}

/**
 * Pikchard in a browser tab.
 *
 * Two browsers, really. Where the File System Access API exists (Chromium) a
 * Document has an **Identity**: Pikchard can write it back in place and find it
 * again from Recent. Where it does not (Firefox, Safari) the user picks through
 * an `<input type=file>` and saving is a download — the Document keeps its
 * **Name** but has no way home, which is a named Document, not an Untitled one
 * (#1054).
 */
export class BrowserPlatform implements Platform {
  readonly kind = "browser" as const;
  readonly capabilities: PlatformCapabilities;

  private readonly scope: typeof globalThis;
  private readonly fsa: FileSystemAccess | null;
  private readonly handles: HandleStore;
  private readonly listeners = new Set<(delivery: OpenDelivery) => void>();
  private launched: Promise<OpenDelivery | null>;
  private launchDrained = false;
  /** The `beforeunload` listener, registered only while the Document is Unsaved. */
  private unloadGuard: ((event: BeforeUnloadEvent) => void) | null = null;

  constructor(options: BrowserPlatformOptions = {}) {
    this.scope = options.scope ?? globalThis;
    this.fsa = detectFileSystemAccess(this.scope);
    this.handles = options.handles ?? new IndexedDbHandleStore();
    this.capabilities = {
      // Both turn on the same API, and deliberately so: without a handle there
      // is nothing to save back to and nothing to remember.
      saveInPlace: this.fsa !== null,
      persistsRecentDocuments: this.fsa !== null,
    };
    this.launched = this.consumeLaunchQueue();
  }

  async openDocument(): Promise<OpenDelivery | null> {
    if (!this.fsa) return this.openWithInput();
    try {
      const [handle] = await this.fsa.showOpenFilePicker({ types: DOCUMENT_TYPES });
      if (!handle) return null;
      // Even here, where the picker was given types: a user can reach past a
      // filter, and the name is the rule (#1018).
      if (!isSupportedDocumentName(handle.name)) return refusing(handle.name);
      return opening(await this.adopt(handle));
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  async readDocument(ref: DocumentRef): Promise<string> {
    const handle = await this.handles.get(ref.key);
    if (!handle) throw new DocumentUnreadableError("missing", `No handle for ${ref.name}`);
    await this.ensurePermission(handle, "read");
    try {
      return await (await handle.getFile()).text();
    } catch (error) {
      // The file is gone, which is exactly what the glossary calls stale — but
      // the pruning is the caller's, because a Save reads the file too (#1054).
      if (isMissing(error)) {
        throw new DocumentUnreadableError("missing", `${ref.name} could not be read`);
      }
      throw error;
    }
  }

  async saveDocument(ref: DocumentRef, text: string): Promise<void> {
    const handle = await this.handles.get(ref.key);
    if (!handle) throw new DocumentUnreadableError("missing", `No handle for ${ref.name}`);
    await this.ensurePermission(handle, "readwrite");
    await this.write(handle, new Blob([text], { type: "text/markdown" }));
  }

  async saveDocumentAs(text: string, suggestedName: string): Promise<SaveAsResult> {
    const blob = new Blob([text], { type: "text/markdown" });
    if (!this.fsa) {
      this.download(blob, suggestedName);
      return { outcome: "downloaded" };
    }
    try {
      const handle = await this.fsa.showSaveFilePicker({ suggestedName, types: DOCUMENT_TYPES });
      await this.write(handle, blob);
      const identity = await this.remember(handle);
      return { outcome: "saved", identity };
    } catch (error) {
      if (isAbort(error)) return { outcome: "cancelled" };
      throw error;
    }
  }

  async exportFile(suggestedName: string, produce: () => Promise<Blob>): Promise<WriteOutcome> {
    if (!this.fsa) {
      // No picker to protect here: the file goes to the downloads folder.
      this.download(await produce(), suggestedName);
      return "downloaded";
    }
    let handle: FileSystemFileHandle;
    try {
      // The picker first, while the gesture is still warm — awaiting the
      // rasterisation before this can consume the transient activation it needs.
      handle = await this.fsa.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Image",
            accept: { [mimeForName(suggestedName)]: [dottedExtensionOf(suggestedName)] },
          },
        ],
      });
    } catch (error) {
      if (isAbort(error)) return "cancelled";
      throw error;
    }
    await this.write(handle, await produce());
    // Deliberately not remembered: an Export never enters Recent (#1055).
    return "saved";
  }

  async recentDocuments(): Promise<DocumentRef[]> {
    return this.capabilities.persistsRecentDocuments ? this.handles.list() : [];
  }

  async forgetRecent(key: string): Promise<void> {
    await this.handles.remove(key);
  }

  /**
   * One `ClipboardItem` with every flavour the browser will take, richest
   * first — WebKit writes them to the pasteboard in the order given, and if the
   * OS can hold only one item it keeps the first (#1055 Q7).
   */
  async clipboardWrite(payload: ClipboardPayload): Promise<void> {
    const item: Record<string, Blob | Promise<Blob>> = {};
    const supports = this.scope.ClipboardItem?.supports;
    if (payload.svg && supports?.("image/svg+xml")) {
      item["image/svg+xml"] = new Blob([payload.svg], { type: "image/svg+xml" });
    }
    // The promise goes in unresolved: `ClipboardItem` takes one, and that is
    // what lets the rasterisation finish after the gesture (#1055).
    if (payload.png) item["image/png"] = payload.png;
    if (payload.text) item["text/plain"] = new Blob([payload.text], { type: "text/plain" });
    if (Object.keys(item).length === 0) return;
    await this.scope.navigator.clipboard.write([new this.scope.ClipboardItem(item)]);
  }

  /** A tab has no menu bar of its own: the app draws its own dropdowns (#1047). */
  async setApplicationMenu(): Promise<null> {
    return null;
  }

  /** A new tab, with `noopener` so the opened page cannot reach back into ours. */
  openExternal(url: string): void {
    this.scope.open(url, "_blank", "noopener,noreferrer");
  }

  setTitle(title: string): void {
    this.scope.document.title = title;
  }

  /**
   * `beforeunload`, registered only while there is something to lose.
   *
   * Only while: Firefox will not put a page in its back/forward cache if a
   * `beforeunload` listener is registered at all, so leaving one attached
   * would cost every user a slower Back for the sake of the minority of
   * sessions that are Unsaved. The dialog's text is the browser's own and
   * cannot be set — the spec says the value of `returnValue` is ignored — so
   * there is nothing to write here (#1054, #1100 D).
   */
  preventClose(prevent: boolean): void {
    if (prevent === (this.unloadGuard !== null)) return;
    if (prevent) {
      this.unloadGuard = (event: BeforeUnloadEvent) => event.preventDefault();
      this.scope.addEventListener("beforeunload", this.unloadGuard);
      return;
    }
    if (this.unloadGuard) this.scope.removeEventListener("beforeunload", this.unloadGuard);
    this.unloadGuard = null;
  }

  /** Never called: the browser asks about leaving on its own terms. */
  onCloseRequested(): Unsubscribe {
    return () => {};
  }

  /**
   * Both events, because they catch different things: `visibilitychange` fires
   * when the tab is backgrounded or the phone is locked — the only signal iOS
   * Safari gives before it may discard the page — and `blur` when the window
   * merely goes behind another.
   */
  onFocusLost(callback: () => void): Unsubscribe {
    const onVisibilityChange = () => {
      if (this.scope.document.visibilityState === "hidden") callback();
    };
    this.scope.addEventListener("blur", callback);
    this.scope.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      this.scope.removeEventListener("blur", callback);
      this.scope.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }

  /** A tab cannot close itself unless it opened itself, so this does nothing. */
  async closeWindow(): Promise<void> {}

  async takeLaunchDelivery(): Promise<OpenDelivery | null> {
    const delivery = await this.launched;
    this.launched = Promise.resolve(null);
    this.launchDrained = true;
    return delivery;
  }

  /**
   * Drag-and-drop. The Browser uses the HTML5 events as normal — the desktop
   * cannot, which is why this lives per-Platform rather than in shared UI code.
   */
  onOpenRequested(callback: (delivery: OpenDelivery) => void): Unsubscribe {
    const target = this.scope.document;
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      void this.fromDrop(event).then((delivery) => {
        if (delivery) callback(delivery);
      });
    };
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("drop", onDrop);
    this.listeners.add(callback);
    return () => {
      target.removeEventListener("dragover", onDragOver);
      target.removeEventListener("drop", onDrop);
      this.listeners.delete(callback);
    };
  }

  /**
   * A drop, as a delivery: the first file, and how many came with it.
   *
   * The name is judged before a byte is read — a dropped `.pdf` is refused
   * rather than loaded as text (#1018) — and the count comes from the
   * `DataTransfer`, which is the only place it survives.
   */
  private async fromDrop(event: DragEvent): Promise<OpenDelivery | null> {
    const transfer = event.dataTransfer;
    const item = transfer?.items?.[0];
    const file = transfer?.files?.[0];
    const count = Math.max(transfer?.items?.length ?? 0, transfer?.files?.length ?? 0);
    const name = file?.name ?? (item as { getAsFile?: () => File | null })?.getAsFile?.()?.name;
    if (!name) return null;
    if (!isSupportedDocumentName(name)) return refusing(name, count);

    // Chromium can give a real handle for a dropped file, which is an Identity.
    const asHandle = (item as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
      ?.getAsFileSystemHandle;
    if (this.fsa && asHandle) {
      const handle = await asHandle.call(item);
      if (handle?.kind === "file") {
        return opening(await this.adopt(handle as FileSystemFileHandle), count);
      }
    }
    if (!file) return null;
    return opening({ name: file.name, text: await file.text(), identity: null }, count);
  }

  /** Read a picked handle and record the Identity it confers. */
  private async adopt(handle: FileSystemFileHandle): Promise<OpenedDocument> {
    const file = await handle.getFile();
    const identity = await this.remember(handle);
    return { name: file.name, text: await file.text(), identity };
  }

  private async remember(handle: FileSystemFileHandle): Promise<DocumentRef> {
    // Reopening the same Document must move its entry, not add a second one —
    // but a Name is not an Identity, and two different `report.md`s must not
    // collapse into one entry. `isSameEntry` is the only honest test.
    const key = (await this.findKey(handle)) ?? this.newKey();
    const ref: DocumentRef = { key, name: handle.name };
    await this.handles.put(ref, handle);
    return ref;
  }

  /** The key already standing for this file, if Recent is holding one. */
  private async findKey(handle: FileSystemFileHandle): Promise<string | undefined> {
    for (const ref of await this.handles.list()) {
      const known = await this.handles.get(ref.key);
      if (known && (await known.isSameEntry(handle))) return ref.key;
    }
    return undefined;
  }

  private newKey(): string {
    return globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}-${Math.random().toString(36)}`;
  }

  private async ensurePermission(handle: FileSystemFileHandle, mode: "read" | "readwrite") {
    const permission = handle as PermissionHandle;
    if (!permission.queryPermission || !permission.requestPermission) return;
    if ((await permission.queryPermission({ mode })) === "granted") return;
    // Needs transient activation, which is why this never runs at launch (#1054).
    if ((await permission.requestPermission({ mode })) !== "granted") {
      throw new DocumentUnreadableError("denied", `Permission denied for ${handle.name}`);
    }
  }

  private async write(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /** Firefox and Safari: the file goes to the downloads folder, unnamed to us. */
  private download(blob: Blob, suggestedName: string): void {
    const url = this.scope.URL.createObjectURL(blob);
    const anchor = this.scope.document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    this.scope.URL.revokeObjectURL(url);
  }

  private async openWithInput(): Promise<OpenDelivery | null> {
    const input = this.scope.document.createElement("input");
    input.type = "file";
    input.accept = [...DOTTED_DOCUMENT_EXTENSIONS, "text/markdown"].join(",");
    const picked = new Promise<File | null>((resolve) => {
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
    });
    input.click();
    const file = await picked;
    if (!file) return null;
    // `accept` is a hint here and nothing more: Firefox and Safari both let the
    // user pick past it, so the name is judged rather than trusted (#1018).
    if (!isSupportedDocumentName(file.name)) return refusing(file.name);
    return opening({ name: file.name, text: await file.text(), identity: null });
  }

  private consumeLaunchQueue(): Promise<OpenDelivery | null> {
    const queue = (this.scope as { launchQueue?: LaunchQueue }).launchQueue;
    if (!queue || !this.fsa) return Promise.resolve(null);
    return new Promise((resolve) => {
      // Registered synchronously in the constructor: Chromium drops the launch
      // if no consumer is set by the time the page settles.
      queue.setConsumer((params) => {
        const files = params.files ?? [];
        const first = files[0];
        if (!first) {
          resolve(null);
          return;
        }
        void this.deliver(first, files.length).then((delivery) => {
          // A launch that arrives after the app gave up waiting is not lost —
          // it becomes an ordinary open request, which is what #1054 says an
          // "open with" is anyway.
          if (this.launchDrained) this.announce(delivery);
          else resolve(delivery);
        });
      });
      // A plain tab has a `launchQueue` whose consumer is never called, so this
      // cannot await it unconditionally. The deadline is generous enough for
      // the consumer Chromium does fire during load, and the branch above
      // covers the case where it is not.
      setTimeout(() => resolve(null), LAUNCH_SETTLE_MS);
    });
  }

  /** The first file of a launch, read only if Pikchard opens files of its name. */
  private async deliver(handle: FileSystemFileHandle, count: number): Promise<OpenDelivery> {
    if (!isSupportedDocumentName(handle.name)) return refusing(handle.name, count);
    return opening(await this.adopt(handle), count);
  }

  private announce(delivery: OpenDelivery): void {
    for (const listener of this.listeners) listener(delivery);
  }
}

/** `"a.svg"` -> `".svg"` — the dotted form the file picker's `accept` wants. */
function dottedExtensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

/**
 * The picker's `accept` key, from the name alone — because the bytes do not
 * exist yet when the picker opens, so the Blob's own `type` cannot be asked.
 */
function mimeForName(name: string): string {
  return dottedExtensionOf(name) === ".svg" ? "image/svg+xml" : "image/png";
}

function detectFileSystemAccess(scope: typeof globalThis): FileSystemAccess | null {
  const candidate = scope as unknown as Partial<FileSystemAccess>;
  if (typeof candidate.showOpenFilePicker !== "function") return null;
  if (typeof candidate.showSaveFilePicker !== "function") return null;
  return {
    showOpenFilePicker: candidate.showOpenFilePicker.bind(scope),
    showSaveFilePicker: candidate.showSaveFilePicker.bind(scope),
  };
}
