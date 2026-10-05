import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserPlatform } from "./browser.js";
import { MemoryHandleStore } from "./handle-store.js";
import { DocumentUnreadableError, type OpenDelivery, type OpenedDocument } from "./types.js";

/** A `FileSystemFileHandle` good enough to open, read and write through. */
class FakeHandle {
  readonly kind = "file";
  permission: PermissionState = "granted";
  getFileError?: DOMException;

  constructor(
    public name: string,
    public contents: string,
  ) {}

  async getFile(): Promise<File> {
    if (this.getFileError) throw this.getFileError;
    return new File([this.contents], this.name);
  }

  async createWritable() {
    const chunks: Blob[] = [];
    return {
      write: async (blob: Blob) => {
        chunks.push(blob);
      },
      close: async () => {
        this.contents = await new Blob(chunks).text();
      },
    };
  }

  /** Identity is per-file, so only the very same handle matches. */
  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return (other as unknown as FakeHandle) === this;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }
  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }
}

const asHandle = (handle: FakeHandle) => handle as unknown as FileSystemFileHandle;
const abort = () => new DOMException("The user aborted a request.", "AbortError");

/**
 * The Document an Open delivered, or `null` where it delivered none — which is
 * what most of these tests are about. The delivery's own shape, the count and
 * the refusal have their own tests.
 */
async function openedBy(platform: BrowserPlatform): Promise<OpenedDocument | null> {
  const delivery = await platform.openDocument();
  return delivery?.outcome === "opened" ? delivery.opened : null;
}

function makeScope(overrides: Record<string, unknown>): typeof globalThis {
  const scope = Object.create(globalThis) as object;
  // `defineProperty`, not `assign`: globals like `navigator` are getter-only on
  // the prototype, and a plain assignment through them throws.
  for (const [name, value] of Object.entries(overrides)) {
    Object.defineProperty(scope, name, { value, configurable: true, writable: true });
  }
  return scope as typeof globalThis;
}

/** A Chromium-shaped scope: both pickers present. */
function chromiumScope(handles: { open?: FakeHandle[]; save?: FakeHandle | Error }) {
  const showOpenFilePicker = vi.fn(async () => {
    if (!handles.open) throw abort();
    return handles.open.map(asHandle);
  });
  const showSaveFilePicker = vi.fn(async () => {
    if (!handles.save) throw abort();
    if (handles.save instanceof Error) throw handles.save;
    return asHandle(handles.save);
  });
  return { scope: makeScope({ showOpenFilePicker, showSaveFilePicker }), showSaveFilePicker };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BrowserPlatform where the File System Access API exists", () => {
  it("can save in place and persist Recent", () => {
    const { scope } = chromiumScope({});

    expect(new BrowserPlatform({ scope, handles: new MemoryHandleStore() }).capabilities).toEqual({
      saveInPlace: true,
      persistsRecentDocuments: true,
    });
  });

  it("opens a Document with an Identity and remembers it", async () => {
    const { scope } = chromiumScope({ open: [new FakeHandle("report.md", "box\n")] });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    const opened = await openedBy(platform);

    expect(opened).toMatchObject({ name: "report.md", text: "box\n" });
    expect(opened?.identity).not.toBeNull();
    await expect(platform.recentDocuments()).resolves.toMatchObject([{ name: "report.md" }]);
  });

  it("treats a cancelled picker as no Document at all", async () => {
    const { scope } = chromiumScope({});
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.openDocument()).resolves.toBeNull();
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("writes the text back through the handle it opened", async () => {
    const handle = new FakeHandle("report.md", "old");
    const { scope } = chromiumScope({ open: [handle] });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });
    const opened = await openedBy(platform);

    // biome-ignore lint/style/noNonNullAssertion: the open above cannot be null here.
    await platform.saveDocument(opened!.identity!, "new");

    expect(handle.contents).toBe("new");
  });

  it("moves a reopened Document in Recent rather than duplicating it", async () => {
    const store = new MemoryHandleStore();
    const { scope } = chromiumScope({ open: [new FakeHandle("report.md", "one")] });
    const platform = new BrowserPlatform({ scope, handles: store });

    const first = await openedBy(platform);
    const second = await openedBy(platform);

    expect(second?.identity?.key).toBe(first?.identity?.key);
    await expect(platform.recentDocuments()).resolves.toHaveLength(1);
  });

  it("gives two different files of the same Name separate Identities", async () => {
    const store = new MemoryHandleStore();
    const first = new FakeHandle("report.md", "one");
    const second = new FakeHandle("report.md", "two");
    const handles: { open?: FakeHandle[] } = { open: [first] };
    const { scope } = chromiumScope(handles);
    const platform = new BrowserPlatform({ scope, handles: store });

    const a = await openedBy(platform);
    handles.open = [second];
    const b = await openedBy(platform);

    // A Name is not an Identity — these must not collapse into one entry.
    expect(b?.identity?.key).not.toBe(a?.identity?.key);
    await expect(platform.recentDocuments()).resolves.toHaveLength(2);
  });

  it("confers an Identity on Save As", async () => {
    const { scope } = chromiumScope({ save: new FakeHandle("new.md", "") });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    const result = await platform.saveDocumentAs("text", "new.md");

    expect(result).toMatchObject({ outcome: "saved", identity: { name: "new.md" } });
    await expect(platform.recentDocuments()).resolves.toMatchObject([{ name: "new.md" }]);
  });

  it("reports a cancelled Save As rather than pretending it saved", async () => {
    const { scope } = chromiumScope({});
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.saveDocumentAs("text", "new.md")).resolves.toEqual({
      outcome: "cancelled",
    });
  });

  it("writes an Export through the picker but never files it under Recent", async () => {
    const target = new FakeHandle("report-1.svg", "");
    const { scope } = chromiumScope({ save: target });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    const outcome = await platform.exportFile(
      "report-1.svg",
      async () => new Blob(["<svg />"], { type: "image/svg+xml" }),
    );

    expect(outcome).toBe("saved");
    expect(target.contents).toBe("<svg />");
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("reports a cancelled Export", async () => {
    const { scope } = chromiumScope({});
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.exportFile("x.png", async () => new Blob(["x"]))).resolves.toBe(
      "cancelled",
    );
  });

  describe("a Recent entry that will not open", () => {
    it("keeps the entry when the user denies permission", async () => {
      const handle = new FakeHandle("report.md", "box\n");
      const { scope } = chromiumScope({ open: [handle] });
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });
      const opened = await openedBy(platform);
      handle.permission = "denied";

      // biome-ignore lint/style/noNonNullAssertion: the open above cannot be null here.
      await expect(platform.readDocument(opened!.identity!)).rejects.toMatchObject({
        reason: "denied",
      });
      await expect(platform.recentDocuments()).resolves.toHaveLength(1);
    });

    it("says the file is gone, and leaves the pruning to the caller", async () => {
      // A read is not a click: Save reads the file too, to see whether it
      // changed underneath, and that must never shorten Recent (#1054).
      const handle = new FakeHandle("report.md", "box\n");
      const { scope } = chromiumScope({ open: [handle] });
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });
      const opened = await openedBy(platform);
      handle.getFileError = new DOMException("gone", "NotFoundError");

      // biome-ignore lint/style/noNonNullAssertion: the open above cannot be null here.
      await expect(platform.readDocument(opened!.identity!)).rejects.toMatchObject({
        reason: "missing",
      });
      await expect(platform.recentDocuments()).resolves.toHaveLength(1);
    });

    it("forgets the entry when asked to", async () => {
      const handle = new FakeHandle("report.md", "box\n");
      const { scope } = chromiumScope({ open: [handle] });
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });
      const opened = await openedBy(platform);

      // biome-ignore lint/style/noNonNullAssertion: the open above cannot be null here.
      await platform.forgetRecent(opened!.identity!.key);

      await expect(platform.recentDocuments()).resolves.toEqual([]);
    });

    it("cannot read an Identity whose handle the store no longer holds", async () => {
      const { scope } = chromiumScope({});
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await expect(platform.readDocument({ key: "ghost", name: "ghost.md" })).rejects.toThrow(
        DocumentUnreadableError,
      );
    });
  });

  describe("clipboardWrite", () => {
    it("offers SVG first when the browser supports the flavour", async () => {
      const write = vi.fn(async () => {});
      const item = vi.fn(function (
        this: Record<string, unknown>,
        data: Record<string, Blob | Promise<Blob>>,
      ) {
        this.data = data;
      });
      Reflect.set(item, "supports", (type: string) => type === "image/svg+xml");
      const scope = makeScope({
        ClipboardItem: item,
        navigator: { clipboard: { write } },
      });
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await platform.clipboardWrite({
        svg: "<svg />",
        png: Promise.resolve(new Blob([], { type: "image/png" })),
        text: "<svg />",
      });

      expect(Object.keys(item.mock.calls[0]?.[0] ?? {})).toEqual([
        "image/svg+xml",
        "image/png",
        "text/plain",
      ]);
      expect(write).toHaveBeenCalledOnce();
    });

    it("drops the SVG flavour where the browser will not take it", async () => {
      const write = vi.fn(async () => {});
      const item = vi.fn(function (
        this: Record<string, unknown>,
        data: Record<string, Blob | Promise<Blob>>,
      ) {
        this.data = data;
      });
      Reflect.set(item, "supports", () => false);
      const scope = makeScope({
        ClipboardItem: item,
        navigator: { clipboard: { write } },
      });
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await platform.clipboardWrite({
        svg: "<svg />",
        png: Promise.resolve(new Blob([], { type: "image/png" })),
      });

      expect(Object.keys(item.mock.calls[0]?.[0] ?? {})).toEqual(["image/png"]);
    });
  });

  it("refuses a picked file it does not open, naming it rather than reading it", async () => {
    // The picker was given types, but a user can reach past a filter (#1018).
    const { scope } = chromiumScope({ open: [new FakeHandle("notes.pdf", "%PDF")] });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.openDocument()).resolves.toEqual({
      outcome: "unsupported",
      name: "notes.pdf",
      count: 1,
    });
    // Refused means untouched: no Identity, and nothing in Recent.
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("has nothing inbound when the browser offers no launch queue", async () => {
    const { scope } = chromiumScope({});
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.takeLaunchDelivery()).resolves.toBeNull();
  });

  it("drains the launch queue, so a reload cannot re-open the file", async () => {
    const { scope } = chromiumScope({});
    Reflect.set(scope, "launchQueue", {
      setConsumer: (consume: (params: { files: FileSystemFileHandle[] }) => void) =>
        consume({ files: [asHandle(new FakeHandle("launched.md", "box\n"))] }),
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.takeLaunchDelivery()).resolves.toMatchObject({
      outcome: "opened",
      count: 1,
      opened: { name: "launched.md" },
    });
    await expect(platform.takeLaunchDelivery()).resolves.toBeNull();
  });

  it("counts every file a launch carried, and opens the first", async () => {
    const { scope } = chromiumScope({});
    Reflect.set(scope, "launchQueue", {
      setConsumer: (consume: (params: { files: FileSystemFileHandle[] }) => void) =>
        consume({
          files: [
            asHandle(new FakeHandle("first.md", "box\n")),
            asHandle(new FakeHandle("second.md", "circle\n")),
          ],
        }),
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.takeLaunchDelivery()).resolves.toMatchObject({
      outcome: "opened",
      count: 2,
      opened: { name: "first.md", text: "box\n" },
    });
  });

  describe("a drop", () => {
    /** Drop `names` on the document, and take the delivery it produced. */
    async function drop(platform: BrowserPlatform, names: string[]) {
      const deliveries: OpenDelivery[] = [];
      platform.onOpenRequested((delivery) => deliveries.push(delivery));
      const files = names.map((name) => new File([`box "${name}"\n`], name));
      const event = new Event("drop", { cancelable: true }) as DragEvent;
      Object.defineProperty(event, "dataTransfer", {
        value: { files, items: files.map((file) => ({ getAsFile: () => file })) },
      });
      window.document.dispatchEvent(event);
      // The drop's read is a promise deep, so let it settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return deliveries;
    }

    it("opens the file, with a Name and no way home", async () => {
      const { scope } = chromiumScope({});
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await expect(drop(platform, ["dropped.md"])).resolves.toMatchObject([
        { outcome: "opened", count: 1, opened: { name: "dropped.md", identity: null } },
      ]);
    });

    it("refuses a file it does not open, before reading a byte of it", async () => {
      const { scope } = chromiumScope({});
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await expect(drop(platform, ["notes.pdf"])).resolves.toEqual([
        { outcome: "unsupported", name: "notes.pdf", count: 1 },
      ]);
    });

    it("counts the files that came with it", async () => {
      const { scope } = chromiumScope({});
      const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

      await expect(drop(platform, ["first.md", "second.md", "third.md"])).resolves.toMatchObject([
        { outcome: "opened", count: 3, opened: { name: "first.md" } },
      ]);
    });
  });
});

describe("BrowserPlatform where the File System Access API is absent", () => {
  /** Firefox and Safari: no pickers on the scope at all. */
  function fallbackScope() {
    const created: HTMLAnchorElement[] = [];
    const scope = makeScope({
      URL: {
        createObjectURL: () => "blob:fake",
        revokeObjectURL: () => {},
      },
    });
    return { scope, created };
  }

  it("can neither save in place nor persist Recent", () => {
    const { scope } = fallbackScope();

    expect(new BrowserPlatform({ scope, handles: new MemoryHandleStore() }).capabilities).toEqual({
      saveInPlace: false,
      persistsRecentDocuments: false,
    });
  });

  it("opens a named Document with no Identity", async () => {
    const { scope } = fallbackScope();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      Object.defineProperty(this, "files", {
        value: [new File(["box\n"], "report.md")],
        configurable: true,
      });
      this.dispatchEvent(new Event("change"));
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    const opened = await openedBy(platform);

    // A Name but no way home — not an Untitled Document (#1054).
    expect(opened).toMatchObject({ name: "report.md", text: "box\n", identity: null });
  });

  it("treats a dismissed file input as a cancelled open", async () => {
    const { scope } = fallbackScope();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      this.dispatchEvent(new Event("cancel"));
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.openDocument()).resolves.toBeNull();
  });

  it("downloads on Save As, which confers no Identity", async () => {
    const { scope } = fallbackScope();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.saveDocumentAs("text", "report.md")).resolves.toEqual({
      outcome: "downloaded",
    });
    expect(downloads).toEqual(["report.md"]);
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("downloads an Export, which is the only outcome that earns a Toast", async () => {
    const { scope } = fallbackScope();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(
      platform.exportFile(
        "report-1.svg",
        async () => new Blob(["<svg />"], { type: "image/svg+xml" }),
      ),
    ).resolves.toBe("downloaded");
    expect(downloads).toEqual(["report-1.svg"]);
  });

  it("reports Recent as empty, because the menu is absent rather than blank", async () => {
    const { scope } = fallbackScope();
    const platform = new BrowserPlatform({ scope, handles: new MemoryHandleStore() });

    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });
});
