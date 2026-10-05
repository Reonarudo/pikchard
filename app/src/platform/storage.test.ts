import { afterEach, describe, expect, it } from "vitest";
import { RecentList } from "./recent.js";
import { JsonList, memoryStore, webStorage } from "./storage.js";

const ref = (path: string) => ({ key: path, name: path.split("/").pop() ?? path, path });

describe("a list kept as one JSON record", () => {
  it("reads back what it wrote", () => {
    const list = new JsonList<string>("test.list", memoryStore());

    list.write(["a", "b"]);

    expect(list.read()).toEqual(["a", "b"]);
  });

  it("reads an empty list where nothing has been kept yet", () => {
    expect(new JsonList("test.list", memoryStore()).read()).toEqual([]);
  });

  it("reads an empty list from a record that is not a list at all", () => {
    const storage = memoryStore();
    storage.setItem("test.list", '{"not":"a list"}');

    expect(new JsonList("test.list", storage).read()).toEqual([]);
  });

  it("reads an empty list from a corrupt record", () => {
    const storage = memoryStore();
    storage.setItem("test.list", "{ not json");

    expect(new JsonList("test.list", storage).read()).toEqual([]);
  });

  it("works where there is no storage at all", () => {
    const list = new JsonList<string>("test.list", null);

    list.write(["a"]);

    expect(list.read()).toEqual([]);
  });
});

/**
 * Storage that is *there* and refuses to work is the case that actually bites:
 * Firefox with storage blocked for the origin throws on the `localStorage`
 * property itself, and a blocked or partitioned store throws from `getItem`
 * even once the object is in hand.
 */
describe("the webview's storage", () => {
  const property = Object.getOwnPropertyDescriptor(window, "localStorage");

  afterEach(() => {
    if (property) Object.defineProperty(window, "localStorage", property);
  });

  it("is usable when it works", () => {
    const storage = webStorage();
    storage?.setItem("test.probe", "here");

    expect(storage?.getItem("test.probe")).toBe("here");
  });

  it("is absent where reading the property throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked for this origin");
      },
    });

    expect(webStorage()).toBeNull();
  });

  it("reads as empty, and writes nothing, where the store itself throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        return {
          getItem() {
            throw new Error("blocked");
          },
          setItem() {
            throw new Error("blocked");
          },
        };
      },
    });
    const storage = webStorage();

    expect(storage).not.toBeNull();
    expect(() => storage?.setItem("k", "v")).not.toThrow();
    expect(storage?.getItem("k")).toBeNull();
  });

  it("carries a list through it without either side throwing", () => {
    // What the e2e run caught: a `RecentList` on a store that throws must be a
    // convenience nobody notices is missing, not an unhandled rejection.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked for this origin");
      },
    });
    const blocked = new RecentList("test.recent");

    blocked.remember(ref("/a.md"));

    expect(blocked.list()).toEqual([]);
  });
});
