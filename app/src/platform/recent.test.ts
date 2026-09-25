import { beforeEach, describe, expect, it } from "vitest";
import { RecentList } from "./recent.js";
import { RECENT_LIMIT } from "./types.js";

const ref = (path: string) => ({ key: path, name: path.split("/").pop() ?? path, path });

describe("RecentList", () => {
  let recent: RecentList;

  beforeEach(() => {
    localStorage.clear();
    recent = new RecentList("test.recent");
  });

  it("is empty before anything is opened", () => {
    expect(recent.list()).toEqual([]);
  });

  it("keeps the newest first", () => {
    recent.remember(ref("/a.md"));
    recent.remember(ref("/b.md"));

    expect(recent.list().map((entry) => entry.key)).toEqual(["/b.md", "/a.md"]);
  });

  it("moves a reopened Document rather than duplicating it", () => {
    recent.remember(ref("/a.md"));
    recent.remember(ref("/b.md"));
    recent.remember(ref("/a.md"));

    expect(recent.list().map((entry) => entry.key)).toEqual(["/a.md", "/b.md"]);
  });

  it(`holds at most ${RECENT_LIMIT} entries`, () => {
    for (let i = 0; i < RECENT_LIMIT + 5; i++) recent.remember(ref(`/f${i}.md`));

    expect(recent.list()).toHaveLength(RECENT_LIMIT);
    expect(recent.list()[0]?.key).toBe(`/f${RECENT_LIMIT + 4}.md`);
  });

  it("forgets an entry that can no longer be read", () => {
    recent.remember(ref("/a.md"));
    recent.remember(ref("/b.md"));

    recent.forget("/a.md");

    expect(recent.list().map((entry) => entry.key)).toEqual(["/b.md"]);
  });

  it("survives a later session by way of storage", () => {
    recent.remember(ref("/a.md"));

    expect(new RecentList("test.recent").list().map((entry) => entry.key)).toEqual(["/a.md"]);
  });

  it("reads corrupt storage as an empty list rather than throwing on launch", () => {
    localStorage.setItem("test.recent", "{ not json");

    expect(recent.list()).toEqual([]);
  });

  it("works where there is no storage at all", () => {
    const withoutStorage = new RecentList("test.recent", null);

    withoutStorage.remember(ref("/a.md"));

    expect(withoutStorage.list()).toEqual([]);
  });
});
