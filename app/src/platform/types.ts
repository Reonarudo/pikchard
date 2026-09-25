/**
 * The Platform seam (ADR 0001): the host Pikchard runs in, seen only through
 * the services it provides. UI code never branches on "is this Tauri" — it
 * takes a `Platform` and reads `capabilities`.
 *
 * The seam is about *files*, which is the only place the two Platforms
 * genuinely diverge. Recent, Drafts, the theme and the split ratio live in the
 * webview's storage on both (ADR 0010), so there is deliberately no
 * preferences method here; anything reaching for one is either a Document
 * operation in disguise or a sign ADR 0010 needs revisiting.
 */

export type PlatformKind = "browser" | "desktop";

/** Recent holds at most ten Documents (#1054). A domain rule, not a store detail. */
export const RECENT_LIMIT = 10;

/**
 * A Document's **Identity**: what lets Pikchard write it back to where it came
 * from and find it again in a later session. Desktop identities carry a real
 * `path`; Browser identities are backed by a File System Access handle the
 * Platform keeps to itself, so `key` is the only portable part.
 */
export interface DocumentRef {
  /** Stable and serialisable — what Recent and the Draft are keyed by. */
  key: string;
  /** The Document's Name, for the title bar and the Recent list. */
  name: string;
  /** The full path, where the Platform has one. A display hint on Browser. */
  path?: string;
}

/**
 * A Document as the Platform handed it over.
 *
 * `identity` is `null` when the Platform had no way back to the file: Firefox
 * and Safari give us the bytes and the Name and nothing else. That is a *named*
 * Document, not an Untitled one (#1054) — the title shows its Name, Save can
 * only download, and it never enters Recent.
 */
export interface OpenedDocument {
  name: string;
  text: string;
  identity: DocumentRef | null;
}

/**
 * One handing-over of files to Pikchard: a dialog pick, a drop, an OS "open
 * with", a launch.
 *
 * A delivery is one Document and a **count**, not a list, because #1057 settled
 * that Pikchard opens the first file in the delivered order and says how many
 * came — so reading the rest would be work thrown away. The count is what the
 * Toast is made of, and it is the only reason this is not simply an
 * {@link OpenedDocument}.
 *
 * `"unsupported"` is judged from the *name*, before anything is read: a file
 * arrives from the OS long before Pikchard may read it, and the refusal is owed
 * to the user whether or not the bytes would have parsed (#1018).
 */
export type OpenDelivery =
  | { readonly outcome: "opened"; readonly opened: OpenedDocument; readonly count: number }
  | { readonly outcome: "unsupported"; readonly name: string; readonly count: number };

/** A delivery of `count` files whose first Pikchard will open. */
export function opening(opened: OpenedDocument, count = 1): OpenDelivery {
  return { outcome: "opened", opened, count };
}

/** A delivery Pikchard refuses, because it does not open files of this name. */
export function refusing(name: string, count = 1): OpenDelivery {
  return { outcome: "unsupported", name, count };
}

/** What Copy puts on the clipboard. Each Platform takes the flavours it can (#1055). */
export interface ClipboardPayload {
  svg?: string;
  /**
   * The bitmap, as a **promise** — deliberately unresolved.
   *
   * Safari rejects a `ClipboardItem` whose values were created outside the
   * user's gesture, so the item has to be built synchronously in the handler and
   * the rasterisation allowed to finish afterwards. Handing over a resolved Blob
   * would mean the caller had already awaited, and the gesture would be gone
   * (#1055).
   */
  png?: Promise<Blob>;
  text?: string;
}

/**
 * What became of a write the user chose a destination for.
 *
 * `"downloaded"` is the Firefox/Safari path: the file went to the downloads
 * folder and Pikchard never learns where. It is the only outcome that earns a
 * Toast (#1055 Q11), which is why it is distinct from `"saved"` rather than
 * both collapsing into success.
 */
export type WriteOutcome = "saved" | "downloaded" | "cancelled";

/**
 * The result of Save As. Only the `"saved"` case confers an Identity — a
 * download leaves the Document exactly as Unsaved as it was.
 */
export type SaveAsResult =
  | { outcome: "saved"; identity: DocumentRef }
  | { outcome: "downloaded" }
  | { outcome: "cancelled" };

/**
 * Why a Document could not be read. The distinction is load-bearing for Recent
 * (#1054): a denial is not staleness — the file is fine and the entry is kept —
 * whereas a missing file means the entry can no longer be read.
 *
 * Reading never prunes, deliberately: an entry is checked only by being
 * *clicked*, and a Save reads the file too (to see whether it changed
 * underneath). Pruning is therefore the click site's call, through
 * {@link Platform.forgetRecent}, and not a side effect of every read.
 */
export type UnreadableReason = "denied" | "missing";

export class DocumentUnreadableError extends Error {
  readonly reason: UnreadableReason;

  constructor(reason: UnreadableReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DocumentUnreadableError";
    this.reason = reason;
  }
}

export interface PlatformCapabilities {
  /** Can save back to the Document it opened, without a dialog. */
  saveInPlace: boolean;
  /**
   * Can keep Documents in a recent list across sessions. False on Firefox and
   * Safari, where Recent is *absent* rather than empty — a permanently empty
   * menu just looks broken (#1054).
   */
  persistsRecentDocuments: boolean;
}

/** Stop listening. Calling it twice is harmless. */
export type Unsubscribe = () => void;

/**
 * A native menu, as Pikchard describes one (#1023).
 *
 * Described rather than built here, because building it is the host's: the desktop
 * turns this into a real menu bar and the Browser has nothing to turn it into. It
 * is the seam's shape that matters — without it `@tauri-apps` would have to be
 * imported by the shell, and ADR 0001 says only one file may do that.
 *
 * `id` is the app's own — a `CommandId`, or `recent:<key>` for a list entry — and
 * is how {@link NativeMenu} finds an item again to change it.
 */
export type MenuNodeSpec =
  | { readonly kind: "submenu"; readonly text: string; readonly items: readonly MenuNodeSpec[] }
  | {
      readonly kind: "item";
      readonly id: string;
      readonly text: string;
      readonly enabled?: boolean;
      /** `"CmdOrCtrl+Shift+S"` — the host's own notation. */
      readonly accelerator?: string;
      /** Present makes it a check item: the three theme choices, and no more. */
      readonly checked?: boolean;
      readonly action: () => void;
    }
  | { readonly kind: "separator" }
  | { readonly kind: "predefined"; readonly item: PredefinedMenuItemKind };

/**
 * The items only the host can supply. Undo and Redo are deliberately **not** here:
 * a predefined Undo drives the webview's own undo stack, which diverges from the
 * editor's, and it can be neither greyed nor observed (#1053 guard 2).
 */
export type PredefinedMenuItemKind =
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "hide"
  | "hideOthers"
  | "showAll";

/**
 * A menu that has been built, and the two things Pikchard does to it afterwards.
 *
 * Per item and not per menu, because every call is an IPC round trip: the app
 * diffs and pushes only what moved (#1053 guard 7).
 */
export interface NativeMenu {
  setEnabled(id: string, enabled: boolean): void;
  setText(id: string, text: string): void;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly capabilities: PlatformCapabilities;

  /**
   * Ask the user for a Document and read it. `null` if they cancelled.
   *
   * A delivery rather than a Document, because a dialog can hand over a file
   * Pikchard does not open: the filter is a filter and not a lock — Firefox's
   * `accept` is a hint, and every OS picker has an "All files" the user can
   * reach for (#1018).
   */
  openDocument(): Promise<OpenDelivery | null>;
  /**
   * Throws {@link DocumentUnreadableError} when the Identity no longer resolves.
   * Never touches Recent — see {@link UnreadableReason}.
   */
  readDocument(ref: DocumentRef): Promise<string>;
  saveDocument(ref: DocumentRef, text: string): Promise<void>;
  /** Ask the user where to save, conferring an Identity where the Platform can. */
  saveDocumentAs(text: string, suggestedName: string): Promise<SaveAsResult>;
  /**
   * Send a copy of the Diagram out of Pikchard. Deliberately *not*
   * `saveDocumentAs`: an Export has no Identity, never enters Recent and never
   * becomes the Document, and reusing the save path would make all three leaks
   * a one-line mistake (#1055 Q10).
   *
   * The bytes are **produced on demand**, after the destination is chosen: both
   * `showSaveFilePicker` and Tauri's dialog need transient activation, and
   * awaiting a rasterisation first can consume it. Which is the exact inverse of
   * {@link Platform.clipboardWrite}, where the item must be built in the gesture
   * and resolve later — getting either backwards fails only sometimes, and only
   * on some browsers (#1055).
   *
   * `produce` is not called at all when the user cancels.
   */
  exportFile(suggestedName: string, produce: () => Promise<Blob>): Promise<WriteOutcome>;

  /**
   * Most-recently-touched first, at most {@link RECENT_LIMIT}. Never validated
   * eagerly — an entry is only ever checked by being opened (#1054), and the
   * one that turns out to have gone is pruned by {@link Platform.forgetRecent}.
   */
  recentDocuments(): Promise<DocumentRef[]>;
  /**
   * Drop an entry from Recent. Called where the pruning rule is decided — a
   * clicked entry whose file can no longer be read — and nowhere else (#1054).
   */
  forgetRecent(key: string): Promise<void>;

  clipboardWrite(payload: ClipboardPayload): Promise<void>;

  /**
   * Hand the host a menu bar, and get back the handle that can change it.
   *
   * `null` where the host has no native menu at all, which is every browser: the
   * web build draws its own dropdowns from the same description (#1047).
   */
  setApplicationMenu(items: readonly MenuNodeSpec[]): Promise<NativeMenu | null>;

  /**
   * Open a URL *outside* Pikchard — pikchr's manual, and the repository in About
   * (#1100). Never an in-app webview: on the desktop navigating the one window
   * away from the app would leave the user with no way back.
   */
  openExternal(url: string): void;

  /**
   * What the window — or the tab — is called: the Document's Name, with the
   * Unsaved dot's counterpart in it (#1047).
   */
  setTitle(title: string): void;

  /**
   * Ask the host to stand between the user and closing, or stop asking.
   *
   * The two Platforms honour this in ways that cannot be made alike, which is
   * why it is a request and not a Prompt. The Browser registers
   * `beforeunload`, and gets the browser's own uncustomisable "Leave site?"
   * dialog — the unload algorithm pauses synchronously, so an in-page Prompt
   * could never resolve, and the listener is removed the moment the Document is
   * saved because Firefox will not bfcache a page that has one at all. The
   * desktop instead intercepts the close and calls
   * {@link Platform.onCloseRequested}, where a real Prompt is possible (#1054).
   */
  preventClose(prevent: boolean): void;
  /**
   * The host is being closed and has been held back for an answer. Only the
   * desktop ever calls this; on the Browser the browser asks for itself.
   */
  onCloseRequested(callback: () => void): Unsubscribe;
  /** Close for real, once the user has answered. A no-op where a tab cannot. */
  closeWindow(): Promise<void>;

  /**
   * The app stopped being looked at: the moment the Draft must be on disk.
   *
   * Per Platform because the event is: the Browser has `visibilitychange` and
   * `blur`, and the desktop has the window's own focus change. This is the flush
   * that covers macOS Cmd+Q, which gives no other warning at all (#1054).
   */
  onFocusLost(callback: () => void): Unsubscribe;

  /**
   * What the OS handed us at launch, before any UI exists. **Drains**: the
   * frontend must know whether a file is inbound before choosing between it and
   * the Restore list, and a reload must never re-open the launch file over the
   * user's work (#1057).
   *
   * **Call {@link Platform.onOpenRequested} first.** The desktop treats this
   * drain as the signal that someone is listening, and switches from queueing
   * "open with" paths to emitting them. Draining before subscribing leaves a
   * gap in which a double-clicked file is dropped.
   */
  takeLaunchDelivery(): Promise<OpenDelivery | null>;
  /** OS "open with" and drag-and-drop, while already running. */
  onOpenRequested(callback: (delivery: OpenDelivery) => void): Unsubscribe;
}
