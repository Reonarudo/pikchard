/**
 * Light, dark, or whatever the system says (#1022).
 *
 * Two different things, kept apart on purpose: the **choice** — which is what the
 * user made and what is remembered — and the **theme**, which is what everything
 * renders with. Only `system` makes them differ, and it is why a resolved theme
 * cannot be what is stored: the answer changes while the app is running, and at
 * sunset it has to change with it.
 *
 * The theme reaches the screen twice over. `index.html` applies it inline, before
 * the bundle has loaded, because a theme applied by React is applied one paint
 * too late and that paint is a white flash on a dark desktop. This module is the
 * same reading, for every paint after the first — and the storage key below is
 * the one thing the two copies must agree on.
 */

import { COPY } from "./copy.js";
import { type KeyValueStore, webStorage } from "./platform/storage.js";
import type { Theme } from "./store.js";

/** What the user chose. `system` is the default, and the only one that tracks. */
export type ThemeChoice = "light" | "dark" | "system";

/** Shared with the inline reading in `index.html` — change both or neither. */
export const THEME_STORAGE_KEY = "pikchard.theme";

/**
 * The three choices and what each is called, in the order they are offered.
 *
 * One list, because it is drawn twice — the web View menu and the native menu's
 * check items — and a fourth choice would otherwise have to be remembered in two
 * places (#1053).
 */
export const THEME_CHOICES: ReadonlyArray<{ choice: ThemeChoice; label: string }> = [
  { choice: "light", label: COPY.themeLight },
  { choice: "dark", label: COPY.themeDark },
  { choice: "system", label: COPY.themeSystem },
];

const CHOICES: readonly string[] = THEME_CHOICES.map((entry) => entry.choice);

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The kept choice, or `system` — which is also the answer for a value this
 * version does not recognise, and for a host whose storage cannot be used at all
 * (`platform/storage.ts`). Nothing here may break a launch.
 */
export function readThemeChoice(storage: KeyValueStore | null = webStorage()): ThemeChoice {
  const kept = storage?.getItem(THEME_STORAGE_KEY);
  return kept !== null && kept !== undefined && CHOICES.includes(kept)
    ? (kept as ThemeChoice)
    : "system";
}

export function writeThemeChoice(
  choice: ThemeChoice,
  storage: KeyValueStore | null = webStorage(),
): void {
  storage?.setItem(THEME_STORAGE_KEY, choice);
}

/**
 * What the system is asking for now. Light where the host cannot be asked — a
 * headless test, an old webview — because light is what the app looks like with
 * no theme applied at all.
 */
export function systemTheme(scope: typeof globalThis = globalThis): Theme {
  return scope.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

/** The theme to render with, given the choice. */
export function resolveTheme(choice: ThemeChoice, scope: typeof globalThis = globalThis): Theme {
  return choice === "system" ? systemTheme(scope) : choice;
}

/**
 * Tell the page which theme it is in.
 *
 * `data-theme` is what the custom properties hang off, and `color-scheme` is what
 * makes the *browser's* own furniture follow — without it a dark app has a light
 * scrollbar down its side and light form controls in its dialogs.
 */
export function applyTheme(theme: Theme, scope: typeof globalThis = globalThis): void {
  const root = scope.document?.documentElement;
  if (!root) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Watch `prefers-color-scheme`, for as long as the choice is `system`.
 *
 * `addEventListener` on the query rather than the deprecated `addListener`, and
 * guarded because a host without `matchMedia` must not make this a crash instead
 * of a missing feature.
 */
export function watchSystemTheme(
  onChange: (theme: Theme) => void,
  scope: typeof globalThis = globalThis,
): () => void {
  const query = scope.matchMedia?.(DARK_QUERY);
  if (!query?.addEventListener) return () => {};
  const listener = (event: { matches: boolean }) => onChange(event.matches ? "dark" : "light");
  query.addEventListener("change", listener as (event: MediaQueryListEvent) => void);
  return () =>
    query.removeEventListener("change", listener as (event: MediaQueryListEvent) => void);
}
