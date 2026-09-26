import { describe, expect, it } from "vitest";
import { memoryStore } from "../platform/storage.js";
import { HomeScreenHint, isIosSafari } from "./home-screen-hint.js";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
/** iPadOS asks for the desktop site by default, and says it is a Mac. */
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const MAC_SAFARI = IPAD_SAFARI;
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15";
/** An app's in-app browser: WebKit, but no `Safari/` token and no Home Screen. */
const IPHONE_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const browser = (
  userAgent: string,
  over: { maxTouchPoints?: number; standalone?: boolean } = {},
) => ({
  userAgent,
  maxTouchPoints: over.maxTouchPoints ?? 0,
  ...(over.standalone === undefined ? {} : { standalone: over.standalone }),
});

describe("which browser the hint is for", () => {
  it("is Safari on an iPhone", () => {
    expect(isIosSafari(browser(IPHONE_SAFARI, { maxTouchPoints: 5 }))).toBe(true);
  });

  it("is Safari on an iPad, which calls itself a Mac", () => {
    expect(isIosSafari(browser(IPAD_SAFARI, { maxTouchPoints: 5 }))).toBe(true);
  });

  it("is not Safari on a Mac, which has no touch screen and no ITP deletion to warn of", () => {
    expect(isIosSafari(browser(MAC_SAFARI))).toBe(false);
  });

  it("is not another browser on iOS, nor an app's in-app browser", () => {
    expect(isIosSafari(browser(IPHONE_CHROME, { maxTouchPoints: 5 }))).toBe(false);
    expect(isIosSafari(browser(IPHONE_FIREFOX, { maxTouchPoints: 5 }))).toBe(false);
    expect(isIosSafari(browser(IPHONE_WEBVIEW, { maxTouchPoints: 5 }))).toBe(false);
  });

  it("is not Android", () => {
    expect(isIosSafari(browser(ANDROID_CHROME, { maxTouchPoints: 5 }))).toBe(false);
  });

  it("is not Pikchard already on the Home Screen, which has nothing left to gain", () => {
    expect(isIosSafari(browser(IPHONE_SAFARI, { maxTouchPoints: 5, standalone: true }))).toBe(
      false,
    );
  });
});

describe("the Home Screen hint", () => {
  it("is due the first time unsaved work is kept, on iOS Safari", () => {
    const hint = new HomeScreenHint(true, memoryStore());

    expect(hint.take()).toBe(true);
  });

  it("is due once, and never again while its flag survives", () => {
    const storage = memoryStore();
    new HomeScreenHint(true, storage).take();

    // A later session, over the same storage.
    const later = new HomeScreenHint(true, storage);

    expect(later.take()).toBe(false);
  });

  it("returns once the storage it was remembered in has been cleared", () => {
    // Which is correct rather than a bug: ITP's deletion is what clears the
    // flag, so the hint comes back exactly when its warning has come true.
    new HomeScreenHint(true, memoryStore()).take();

    expect(new HomeScreenHint(true, memoryStore()).take()).toBe(true);
  });

  it("is never due anywhere else", () => {
    const hint = new HomeScreenHint(false, memoryStore());

    expect(hint.take()).toBe(false);
  });

  it("is still shown once where there is no storage to remember it in", () => {
    // Blocked storage keeps no Draft either, but a session that somehow reaches
    // here must not be told on every write.
    const hint = new HomeScreenHint(true, null);

    expect(hint.take()).toBe(true);
    expect(hint.take()).toBe(false);
  });
});
