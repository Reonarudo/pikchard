import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake.js";
import { type DocumentRef, opening } from "../platform/types.js";
import { openFromRecent } from "./open.js";

/** A file in the fake's world that has been opened once, so Recent holds it. */
async function remembered(platform: FakePlatform): Promise<DocumentRef> {
  const identity = platform.addFile("/notes.md", "notes.md", "box\n");
  platform.nextOpen = opening({ name: "notes.md", text: "box\n", identity });
  await platform.openDocument();
  return identity;
}

describe("opening a Recent entry", () => {
  it("reads the Document back, with the Identity it was remembered by", async () => {
    const platform = new FakePlatform();
    const identity = platform.addFile("/notes.md", "notes.md", "box\n");

    expect(await openFromRecent(platform, identity)).toEqual({
      outcome: "opened",
      opened: { name: "notes.md", text: "box\n", identity },
    });
  });

  it("reports a denial, which the Platform has left the entry alone for", async () => {
    // A denial is not staleness: the file is fine, and clicking again and
    // allowing is the fix (#1054).
    const platform = new FakePlatform();
    const identity = await remembered(platform);
    platform.breakFile("/notes.md", "denied");

    expect(await openFromRecent(platform, identity)).toEqual({
      outcome: "denied",
      name: "notes.md",
    });
    expect(await platform.recentDocuments()).toEqual([identity]);
  });

  it("reports a file that has gone, which the Platform has pruned", async () => {
    const platform = new FakePlatform();
    const identity = await remembered(platform);
    platform.breakFile("/notes.md", "missing");

    expect(await openFromRecent(platform, identity)).toEqual({
      outcome: "missing",
      name: "notes.md",
    });
    expect(await platform.recentDocuments()).toEqual([]);
  });

  it("keeps the entry when a *Save* found the file gone, because that is not a click", async () => {
    // The rule is that an entry is checked only by being clicked (#1054), and a
    // Save reads the file too — to see whether it changed underneath.
    const platform = new FakePlatform();
    const identity = await remembered(platform);
    platform.breakFile("/notes.md", "missing");

    await expect(platform.readDocument(identity)).rejects.toThrow();

    expect(await platform.recentDocuments()).toEqual([identity]);
  });

  it("leaves an unexpected failure to the caller", async () => {
    // Nothing has been pruned, so none of the three Toasts is true of it.
    const platform = new FakePlatform();
    const broken = new Error("the disk caught fire");
    platform.readDocument = () => Promise.reject(broken);

    await expect(openFromRecent(platform, { key: "/notes.md", name: "notes.md" })).rejects.toBe(
      broken,
    );
  });
});
