import { MemoryRecentList } from "./recent.js";
import {
  type ClipboardPayload,
  type DocumentRef,
  DocumentUnreadableError,
  type MenuNodeSpec,
  type NativeMenu,
  type OpenDelivery,
  type Platform,
  type PlatformCapabilities,
  type PlatformKind,
  type SaveAsResult,
  type UnreadableReason,
  type Unsubscribe,
  type WriteOutcome,
} from "./types.js";

/** A file in the fake's world, keyed by Identity. */
interface FakeFile {
  name: string;
  text: string;
  /** Set to fail the next read, so the Recent rules (#1054) can be exercised. */
  unreadable?: UnreadableReason;
}

export interface FakePlatformOptions {
  kind?: PlatformKind;
  capabilities?: Partial<PlatformCapabilities>;
  /** Files the fake already "has", keyed by Identity. */
  files?: Record<string, FakeFile>;
}

/** An Export, as the fake recorded it. */
export interface RecordedExport {
  suggestedName: string;
  type: string;
  text: string;
}

/**
 * The Platform the tests run against. Holds its files in memory and records
 * every write, so a test can assert what Pikchard asked the host to do without
 * a dialog, a disk or a clipboard.
 */
export class FakePlatform implements Platform {
  readonly kind: PlatformKind;
  readonly capabilities: PlatformCapabilities;

  /** Answers the next `openDocument()`; `null` stands for a cancelled dialog. */
  nextOpen: OpenDelivery | null = null;
  /** How many times the dialog was opened — a Prompt's Cancel must leave it at 0. */
  openPrompts = 0;
  /** Answers the next `saveDocumentAs()`. */
  nextSaveAs: SaveAsResult = { outcome: "cancelled" };
  /** Answers the next `exportFile()`. */
  nextExport: WriteOutcome = "saved";

  readonly saved: Array<{ key: string; text: string }> = [];
  /** The names Save As was asked to suggest — a Document arrives at a file by one. */
  readonly saveAsPrompts: string[] = [];
  readonly exported: RecordedExport[] = [];
  readonly clipboard: ClipboardPayload[] = [];
  /** What the window is called, as the app last set it. */
  title: string | null = null;
  /** Whether the app has asked to be consulted before the window closes. */
  closePrevented = false;
  /** Whether the window was actually let go of. */
  closed = false;

  private readonly files = new Map<string, FakeFile>();
  private readonly recent = new MemoryRecentList();
  private launch: OpenDelivery | null = null;
  private readonly listeners = new Set<(delivery: OpenDelivery) => void>();
  private readonly closeListeners = new Set<() => void>();
  private readonly focusListeners = new Set<() => void>();

  constructor(options: FakePlatformOptions = {}) {
    this.kind = options.kind ?? "browser";
    this.capabilities = {
      saveInPlace: true,
      persistsRecentDocuments: true,
      ...options.capabilities,
    };
    for (const [key, file] of Object.entries(options.files ?? {})) {
      this.files.set(key, { ...file });
    }
  }

  /** Put a file in the fake's world and return the Identity that reaches it. */
  addFile(key: string, name: string, text: string): DocumentRef {
    this.files.set(key, { name, text });
    return { key, name };
  }

  /** Make the next read of `key` fail, the way a denial or a deletion would. */
  breakFile(key: string, reason: UnreadableReason): void {
    const file = this.files.get(key);
    if (file) file.unreadable = reason;
  }

  /** Queue what the OS handed over at launch, for `takeLaunchDelivery()` to drain. */
  setLaunchDelivery(delivery: OpenDelivery): void {
    this.launch = delivery;
  }

  /** Stand in for an OS "open with" or a drop while the app is already running. */
  emitOpenRequested(delivery: OpenDelivery): void {
    this.materialise(delivery);
    for (const listener of this.listeners) listener(delivery);
  }

  async openDocument(): Promise<OpenDelivery | null> {
    this.openPrompts += 1;
    const delivery = this.nextOpen;
    if (delivery) this.materialise(delivery);
    return delivery;
  }

  /** Never prunes Recent: that is the click site's call (#1054). */
  async readDocument(ref: DocumentRef): Promise<string> {
    const file = this.files.get(ref.key);
    if (!file) throw new DocumentUnreadableError("missing", `No such file: ${ref.key}`);
    if (file.unreadable) {
      throw new DocumentUnreadableError(file.unreadable, `Cannot read ${ref.key}`);
    }
    return file.text;
  }

  async saveDocument(ref: DocumentRef, text: string): Promise<void> {
    const file = this.files.get(ref.key);
    this.files.set(ref.key, { name: file?.name ?? ref.name, text });
    this.saved.push({ key: ref.key, text });
  }

  async saveDocumentAs(text: string, suggestedName: string): Promise<SaveAsResult> {
    this.saveAsPrompts.push(suggestedName);
    const result = this.nextSaveAs;
    if (result.outcome === "saved") {
      this.files.set(result.identity.key, { name: result.identity.name, text });
      this.saved.push({ key: result.identity.key, text });
      this.remember(result.identity);
    }
    return result;
  }

  /**
   * Records the Export, and — like both real Platforms — asks for the bytes only
   * once a destination is settled, so a test can see that a cancelled Export
   * never rasterised anything (#1055).
   */
  async exportFile(suggestedName: string, produce: () => Promise<Blob>): Promise<WriteOutcome> {
    if (this.nextExport === "cancelled") return "cancelled";
    const blob = await produce();
    this.exported.push({ suggestedName, type: blob.type, text: await blob.text() });
    return this.nextExport;
  }

  async recentDocuments(): Promise<DocumentRef[]> {
    return this.capabilities.persistsRecentDocuments ? this.recent.list() : [];
  }

  async forgetRecent(key: string): Promise<void> {
    this.recent.forget(key);
  }

  async clipboardWrite(payload: ClipboardPayload): Promise<void> {
    this.clipboard.push(payload);
  }

  /** What the app asked the host to open elsewhere. */
  readonly openedExternally: string[] = [];

  /** The menu the app last described, and what it has changed about it since. */
  menu: readonly MenuNodeSpec[] | null = null;
  readonly menuPushes: Array<{ id: string; enabled?: boolean; text?: string }> = [];
  /** How many times a menu has been built — rebuilding is the expensive one. */
  menuBuilds = 0;

  /**
   * Behaves like the desktop: a browser has no native menu and answers `null`,
   * which is what `kind` decides here so a test can have either.
   */
  async setApplicationMenu(items: readonly MenuNodeSpec[]): Promise<NativeMenu | null> {
    if (this.kind !== "desktop") return null;
    this.menu = items;
    this.menuBuilds += 1;
    return {
      setEnabled: (id, enabled) => this.menuPushes.push({ id, enabled }),
      setText: (id, text) => this.menuPushes.push({ id, text }),
    };
  }

  /** Invoke a menu item by its id, the way the OS would. */
  clickMenuItem(id: string): void {
    const found = findMenuItem(this.menu ?? [], id);
    if (!found) throw new Error(`No menu item ${id}`);
    found.action();
  }

  openExternal(url: string): void {
    this.openedExternally.push(url);
  }

  setTitle(title: string): void {
    this.title = title;
  }

  preventClose(prevent: boolean): void {
    this.closePrevented = prevent;
  }

  onCloseRequested(callback: () => void): Unsubscribe {
    this.closeListeners.add(callback);
    return () => this.closeListeners.delete(callback);
  }

  onFocusLost(callback: () => void): Unsubscribe {
    this.focusListeners.add(callback);
    return () => this.focusListeners.delete(callback);
  }

  /** Stand in for the app being put behind something, or being quit. */
  emitFocusLost(): void {
    for (const listener of this.focusListeners) listener();
  }

  /** Stand in for the user closing the window, the way the desktop reports it. */
  emitCloseRequested(): void {
    if (!this.closePrevented) {
      void this.closeWindow();
      return;
    }
    for (const listener of this.closeListeners) listener();
  }

  async closeWindow(): Promise<void> {
    this.closed = true;
  }

  async takeLaunchDelivery(): Promise<OpenDelivery | null> {
    const delivery = this.launch;
    this.launch = null;
    if (delivery) this.materialise(delivery);
    return delivery;
  }

  onOpenRequested(callback: (delivery: OpenDelivery) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * A Document the host just handed over exists in the fake's world and, if it
   * came with an Identity, belongs in Recent — Open, drop and OS "open with"
   * all confer one (#1054).
   */
  private materialise(delivery: OpenDelivery): void {
    if (delivery.outcome !== "opened") return;
    const { opened } = delivery;
    if (!opened.identity) return;
    if (!this.files.has(opened.identity.key)) {
      this.files.set(opened.identity.key, { name: opened.name, text: opened.text });
    }
    this.remember(opened.identity);
  }

  private remember(identity: DocumentRef): void {
    if (!this.capabilities.persistsRecentDocuments) return;
    this.recent.remember(identity);
  }
}

/** The item with this id, wherever it is in the tree. */
function findMenuItem(
  items: readonly MenuNodeSpec[],
  id: string,
): Extract<MenuNodeSpec, { kind: "item" }> | null {
  for (const item of items) {
    if (item.kind === "item" && item.id === id) return item;
    if (item.kind === "submenu") {
      const found = findMenuItem(item.items, id);
      if (found) return found;
    }
  }
  return null;
}
