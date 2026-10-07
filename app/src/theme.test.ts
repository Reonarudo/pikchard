import { describe, expect, it, vi } from "vitest";
import { memoryStore } from "./platform/storage.js";
import {
  applyTheme,
  readThemeChoice,
  resolveTheme,
  systemTheme,
  THEME_STORAGE_KEY,
  watchSystemTheme,
  writeThemeChoice,
} from "./theme.js";

/** A host whose `prefers-color-scheme` answer is ours to set. */
function fakeScope(dark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
  };
  const scope = {
    matchMedia: (text: string) => {
      expect(text).toBe("(prefers-color-scheme: dark)");
      return query;
    },
  } as unknown as typeof globalThis;
  const announce = (matches: boolean) => {
    for (const listener of listeners) listener({ matches });
  };
  return { scope, announce };
}

describe("the theme the user chose", () => {
  it("follows the system until someone says otherwise", () => {
    expect(readThemeChoice(memoryStore())).toBe("system");
  });

  it("comes back as it was kept, across sessions", () => {
    const storage = memoryStore();

    writeThemeChoice("dark", storage);

    expect(readThemeChoice(storage)).toBe("dark");
  });

  it("falls back to the system rather than trusting a value it does not know", () => {
    // Another version of Pikchard, or a user with a console: neither may break a
    // launch (`platform/storage.ts`).
    const storage = memoryStore();
    storage.setItem(THEME_STORAGE_KEY, "solarized");

    expect(readThemeChoice(storage)).toBe("system");
  });

  it("survives a host with no storage at all", () => {
    expect(readThemeChoice(null)).toBe("system");
    expect(() => writeThemeChoice("dark", null)).not.toThrow();
  });
});

describe("what the theme resolves to", () => {
  it("is what was chosen, when something was", () => {
    expect(resolveTheme("dark", fakeScope(false).scope)).toBe("dark");
    expect(resolveTheme("light", fakeScope(true).scope)).toBe("light");
  });

  it("is the system's answer under `system`", () => {
    expect(resolveTheme("system", fakeScope(true).scope)).toBe("dark");
    expect(resolveTheme("system", fakeScope(false).scope)).toBe("light");
  });

  it("is light where the host cannot be asked", () => {
    expect(systemTheme({} as typeof globalThis)).toBe("light");
  });
});

describe("following the system live", () => {
  it("reports the system changing its mind, and stops when told to", () => {
    const { scope, announce } = fakeScope(false);
    const seen: string[] = [];

    const stop = watchSystemTheme((theme) => seen.push(theme), scope);
    announce(true);
    stop();
    announce(false);

    expect(seen).toEqual(["dark"]);
  });

  it("is harmless on a host with no `matchMedia`", () => {
    const stop = watchSystemTheme(() => {}, {} as typeof globalThis);

    expect(() => stop()).not.toThrow();
  });
});

describe("applying the theme to the page", () => {
  it("marks the document and tells the browser, so its own widgets follow", () => {
    // `color-scheme` is what makes scrollbars and form controls dark; without it
    // a dark app has a light scrollbar down its side.
    const root = window.document.documentElement;

    applyTheme("dark");

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    applyTheme("light");

    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  it("does nothing where there is no document", () => {
    expect(() => applyTheme("dark", {} as typeof globalThis)).not.toThrow();
  });
});

describe("the theme applied before the first paint", () => {
  it("is the same key the app reads afterwards", async () => {
    // `index.html` carries a copy of this reading, inline, because a theme
    // applied by the bundle is applied one paint too late. The key is the one
    // thing the two must agree on.
    const html = await vi.importActual<{ default: string }>("../index.html?raw").catch(() => null);
    const source = html?.default ?? (await readIndexHtml());

    expect(source).toContain(THEME_STORAGE_KEY);
  });
});

async function readIndexHtml(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
}
