import { describe, expect, it, vi } from "vitest";
import { type RegisterSW, type RegisterSWOptions, watchForUpdates } from "./updates.js";

/** A stand-in for `virtual:pwa-register`: it hands back the hooks it was given. */
function fakeRegister() {
  const calls: RegisterSWOptions[] = [];
  const skipWaiting = vi.fn(async () => {});
  const register: RegisterSW = (options) => {
    calls.push(options);
    return skipWaiting;
  };
  const hooks = () => {
    const options = calls[0];
    if (!options) throw new Error("registerSW was never called");
    return options;
  };
  return { register, calls, skipWaiting, hooks };
}

describe("watching for a new version", () => {
  it("registers once, after the page has loaded rather than racing it", () => {
    // `immediate: false` defers registration to `load`, so the precache
    // download never competes with the first load's own WASM and chunks.
    const fake = fakeRegister();

    watchForUpdates(fake.register);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.immediate).toBe(false);
  });

  it("announces nothing when the app is first made available offline", () => {
    // The user neither asked for a service worker nor has a decision to make
    // about one (#1025).
    const fake = fakeRegister();
    const listener = vi.fn();
    watchForUpdates(fake.register).onReady(listener);

    fake.hooks().onOfflineReady?.();

    expect(listener).not.toHaveBeenCalled();
  });

  it("tells the listener when a new version is waiting", () => {
    const fake = fakeRegister();
    const listener = vi.fn();
    watchForUpdates(fake.register).onReady(listener);

    fake.hooks().onNeedRefresh?.();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tells a listener that arrives late, but only once", () => {
    // React subscribes in an effect, which may run after the worker has
    // already reported — and StrictMode subscribes twice.
    const fake = fakeRegister();
    const watch = watchForUpdates(fake.register);
    fake.hooks().onNeedRefresh?.();

    const first = vi.fn();
    watch.onReady(first)();
    const second = vi.fn();
    watch.onReady(second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("takes the new version only when asked to", async () => {
    const fake = fakeRegister();
    let apply: (() => Promise<void>) | null = null;
    watchForUpdates(fake.register).onReady((take) => {
      apply = take;
    });
    fake.hooks().onNeedRefresh?.();

    expect(fake.skipWaiting).not.toHaveBeenCalled();
    await (apply as unknown as () => Promise<void>)();

    expect(fake.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("reloads once the new version controls the page it was asked from", async () => {
    const fake = fakeRegister();
    const reload = vi.fn();
    let apply: (() => Promise<void>) | null = null;
    watchForUpdates(fake.register, reload).onReady((take) => {
      apply = take;
    });
    fake.hooks().onNeedRefresh?.();

    await (apply as unknown as () => Promise<void>)();
    expect(reload).not.toHaveBeenCalled();
    fake.hooks().onNeedReload?.();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads a tab that did not ask, when another tab took the update", () => {
    // The plugin's default is to reload every tab the moment the new worker
    // takes control — which, in a tab with unsaved work in it, is exactly the
    // unasked reload the Story forbids.
    const fake = fakeRegister();
    const reload = vi.fn();
    watchForUpdates(fake.register, reload).onReady(() => {});
    fake.hooks().onNeedRefresh?.();

    fake.hooks().onNeedReload?.();

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads at once when asked after another tab already took the update", async () => {
    // The worker is no longer waiting, so asking it to skip waiting would never
    // produce the `controlling` event this tab is holding out for.
    const fake = fakeRegister();
    const reload = vi.fn();
    let apply: (() => Promise<void>) | null = null;
    watchForUpdates(fake.register, reload).onReady((take) => {
      apply = take;
    });
    fake.hooks().onNeedRefresh?.();
    fake.hooks().onNeedReload?.();

    await (apply as unknown as () => Promise<void>)();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(fake.skipWaiting).not.toHaveBeenCalled();
  });

  it("announces a second new version, even when the first went unanswered", () => {
    const fake = fakeRegister();
    const listener = vi.fn();
    watchForUpdates(fake.register).onReady(listener);

    fake.hooks().onNeedRefresh?.();
    fake.hooks().onNeedRefresh?.();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
