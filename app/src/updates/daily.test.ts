import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../platform/storage.js";
import { DAY_MS, DailyUpdateCheck } from "./daily.js";
import type { UpdateCheck } from "./releases.js";

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

const AVAILABLE: UpdateCheck = { kind: "available", version: "0.3.0", url: "https://example/r" };

function daily(answer: UpdateCheck, storage = memory()) {
  const check = vi.fn(async () => answer);
  const offer = vi.fn();
  let now = 1_000_000_000_000;
  const watch = new DailyUpdateCheck({ check }, offer, storage, () => now);
  return {
    watch,
    check,
    offer,
    storage,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe("the daily update check", () => {
  it("offers a newer release it finds", async () => {
    const { watch, offer } = daily(AVAILABLE);

    await watch.run();

    expect(offer).toHaveBeenCalledWith(AVAILABLE);
  });

  it("asks at most once a day", async () => {
    const { watch, check, later } = daily({ kind: "current" });

    await watch.run();
    later(DAY_MS - 1);
    await watch.run();
    expect(check).toHaveBeenCalledTimes(1);

    later(1);
    await watch.run();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("offers each release once, however many days it stays the newest", async () => {
    const { watch, offer, later } = daily(AVAILABLE);

    await watch.run();
    later(DAY_MS);
    await watch.run();

    expect(offer).toHaveBeenCalledTimes(1);
  });

  it("says nothing offline, and tries again next launch rather than tomorrow", async () => {
    const { watch, check, offer } = daily({ kind: "failed" });

    await watch.run();
    await watch.run();

    expect(offer).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("never offers a release the user was already shown by asking", async () => {
    const { watch, offer } = daily(AVAILABLE);

    watch.shown("0.3.0");
    await watch.run();

    expect(offer).not.toHaveBeenCalled();
  });

  it("does nothing at all without storage, rather than ask on every launch", async () => {
    const check = vi.fn(async () => AVAILABLE);
    const watch = new DailyUpdateCheck({ check }, vi.fn(), null, () => 0);

    await watch.run();

    expect(check).not.toHaveBeenCalled();
  });
});
