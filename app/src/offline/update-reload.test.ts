import { describe, expect, it } from "vitest";
import { memoryStore } from "../platform/storage.js";
import { markUpdateReload, takeUpdateReload } from "./update-reload.js";

describe("the note an update reload leaves for itself", () => {
  it("names the Document whose work to bring back", () => {
    const storage = memoryStore();

    markUpdateReload("/notes.md", storage);

    expect(takeUpdateReload(storage)).toBe("/notes.md");
  });

  it("is read once: a second launch in the same tab is an ordinary one", () => {
    const storage = memoryStore();
    markUpdateReload("/notes.md", storage);
    takeUpdateReload(storage);

    expect(takeUpdateReload(storage)).toBeNull();
  });

  it("is absent on every launch the user did not ask for", () => {
    expect(takeUpdateReload(memoryStore())).toBeNull();
  });

  it("is absent where there is no storage to leave it in", () => {
    markUpdateReload("/notes.md", null);

    expect(takeUpdateReload(null)).toBeNull();
  });
});
