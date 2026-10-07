import { describe, expect, it } from "vitest";
import { FakePlatform } from "./fake.js";
import { DocumentUnreadableError, type OpenedDocument, opening } from "./types.js";

const opened = (name: string, text: string, key?: string): OpenedDocument => ({
  name,
  text,
  identity: key ? { key, name } : null,
});

describe("FakePlatform", () => {
  it("hands back the Document queued for the next open", async () => {
    const platform = new FakePlatform();
    platform.nextOpen = opening(opened("report.md", "box\n", "/tmp/report.md"));

    await expect(platform.openDocument()).resolves.toMatchObject({
      outcome: "opened",
      opened: { name: "report.md" },
    });
  });

  it("treats a null open as a cancelled dialog and remembers nothing", async () => {
    const platform = new FakePlatform();

    await expect(platform.openDocument()).resolves.toBeNull();
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("records what was saved, so a test can assert the bytes", async () => {
    const platform = new FakePlatform();
    const ref = platform.addFile("/tmp/a.md", "a.md", "old");

    await platform.saveDocument(ref, "new");

    expect(platform.saved).toEqual([{ key: "/tmp/a.md", text: "new" }]);
    await expect(platform.readDocument(ref)).resolves.toBe("new");
  });

  it("records an Export with its type, and never files it under Recent", async () => {
    const platform = new FakePlatform();

    const outcome = await platform.exportFile(
      "report-1.svg",
      async () => new Blob(["<svg />"], { type: "image/svg+xml" }),
    );

    expect(outcome).toBe("saved");
    expect(platform.exported).toEqual([
      { suggestedName: "report-1.svg", type: "image/svg+xml", text: "<svg />" },
    ]);
    await expect(platform.recentDocuments()).resolves.toEqual([]);
  });

  it("records nothing for a cancelled Export", async () => {
    const platform = new FakePlatform();
    platform.nextExport = "cancelled";

    await expect(platform.exportFile("x.png", async () => new Blob(["x"]))).resolves.toBe(
      "cancelled",
    );
    expect(platform.exported).toEqual([]);
  });

  describe("Recent", () => {
    it("moves a reopened Document rather than duplicating it", async () => {
      const platform = new FakePlatform();
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();
      platform.nextOpen = opening(opened("b.md", "b", "/b"));
      await platform.openDocument();
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();

      await expect(platform.recentDocuments()).resolves.toMatchObject([
        { key: "/a" },
        { key: "/b" },
      ]);
    });

    it("keeps at most ten entries, newest first", async () => {
      const platform = new FakePlatform();
      for (let i = 0; i < 12; i++) {
        platform.nextOpen = opening(opened(`f${i}.md`, "x", `/f${i}`));
        await platform.openDocument();
      }

      const recent = await platform.recentDocuments();
      expect(recent).toHaveLength(10);
      expect(recent[0]?.key).toBe("/f11");
    });

    it("enters a Document on Save As, because that confers an Identity", async () => {
      const platform = new FakePlatform();
      platform.nextSaveAs = { outcome: "saved", identity: { key: "/new.md", name: "new.md" } };

      await platform.saveDocumentAs("text", "new.md");

      await expect(platform.recentDocuments()).resolves.toMatchObject([{ key: "/new.md" }]);
    });

    it("confers no Identity when Save As only downloaded", async () => {
      const platform = new FakePlatform();
      platform.nextSaveAs = { outcome: "downloaded" };

      await platform.saveDocumentAs("text", "new.md");

      await expect(platform.recentDocuments()).resolves.toEqual([]);
    });

    it("is absent, not empty, where the Platform cannot persist it", async () => {
      const platform = new FakePlatform({ capabilities: { persistsRecentDocuments: false } });
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();

      await expect(platform.recentDocuments()).resolves.toEqual([]);
    });

    it("keeps the entry when the read was denied — a denial is not staleness", async () => {
      const platform = new FakePlatform();
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();
      platform.breakFile("/a", "denied");

      await expect(platform.readDocument({ key: "/a", name: "a.md" })).rejects.toThrow(
        DocumentUnreadableError,
      );
      await expect(platform.recentDocuments()).resolves.toMatchObject([{ key: "/a" }]);
    });

    it("says the Document can no longer be read, and prunes nothing itself", async () => {
      // Reading is not pruning: Save reads the file too (#1054).
      const platform = new FakePlatform();
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();
      platform.breakFile("/a", "missing");

      await expect(platform.readDocument({ key: "/a", name: "a.md" })).rejects.toMatchObject({
        reason: "missing",
      });
      await expect(platform.recentDocuments()).resolves.toMatchObject([{ key: "/a" }]);
    });

    it("forgets the entry when asked to", async () => {
      const platform = new FakePlatform();
      platform.nextOpen = opening(opened("a.md", "a", "/a"));
      await platform.openDocument();

      await platform.forgetRecent("/a");

      await expect(platform.recentDocuments()).resolves.toEqual([]);
    });
  });

  describe("what the OS handed over at launch", () => {
    it("drains, so a reload cannot re-open the launch file", async () => {
      const platform = new FakePlatform();
      platform.setLaunchDelivery(opening(opened("a.md", "a", "/a")));

      await expect(platform.takeLaunchDelivery()).resolves.toMatchObject({ outcome: "opened" });
      await expect(platform.takeLaunchDelivery()).resolves.toBeNull();
    });
  });

  describe("onOpenRequested", () => {
    it("delivers to a listener until it unsubscribes", () => {
      const platform = new FakePlatform();
      const seen: string[] = [];
      const stop = platform.onOpenRequested((delivery) => {
        if (delivery.outcome === "opened") seen.push(delivery.opened.name);
      });

      platform.emitOpenRequested(opening(opened("a.md", "a", "/a")));
      stop();
      platform.emitOpenRequested(opening(opened("b.md", "b", "/b")));

      expect(seen).toEqual(["a.md"]);
    });
  });
});
