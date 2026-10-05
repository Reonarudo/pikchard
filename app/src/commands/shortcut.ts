/**
 * A Shortcut, as data (#1023, #1053).
 *
 * The key combination that invokes a Command, written once as a structured
 * literal and formatted three ways from there: for a `KeyboardEvent` to be
 * matched against, for a native menu accelerator, and for a human to read in a
 * menu. Three renderings of one fact, rather than three strings to keep in step —
 * and `Mod+Alt+N` on web against `Mod+N` on desktop is exactly the kind of
 * divergence that survives only when it is stated in one place (`PlatformKind`
 * overrides below).
 *
 * `mod` is ⌘ on macOS and Ctrl everywhere else, which is the only modifier
 * Pikchard ever needs to think about: accepting either at match time is what lets
 * a Mac keyboard on Linux work, and no Command claims the pair.
 */

import type { PlatformKind } from "../platform/types.js";

export interface Shortcut {
  /** ⌘ on macOS, Ctrl elsewhere. Nearly always true. */
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /**
   * The key, as `KeyboardEvent.key` in lower case — `"s"`, `"="`, `"arrowdown"`.
   * Spelled the way the event spells it so matching needs no translation table.
   */
  readonly key: string;
}

/** A Shortcut that differs per Platform: `new` is the only one in v1. */
export interface PlatformShortcuts {
  readonly browser: Shortcut;
  readonly desktop: Shortcut;
}

export type ShortcutBinding = Shortcut | PlatformShortcuts;

export function shortcutFor(binding: ShortcutBinding, kind: PlatformKind): Shortcut {
  return "key" in binding ? binding : binding[kind];
}

/**
 * Whether the event is the `+` that Zoom In's `=` also means (#1053 guard 4).
 *
 * The key marked `+` sends `=` unshifted and `+` *with Shift*, and the numpad's
 * sends `+` with no Shift at all — so a `+` arrives with either, and a user
 * pressing any of them means Zoom In. This is the one place Shift is not compared,
 * and deliberately only here: everywhere else Mod+Shift+S must stay Save As.
 */
function isPlusFor(shortcut: Shortcut, key: string): boolean {
  return shortcut.key === "=" && key === "+";
}

/** Whether this event is that Shortcut. */
export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const key = event.key.toLowerCase();
  const plus = isPlusFor(shortcut, key);
  if (key !== shortcut.key && !plus) return false;

  // Either modifier for `mod`, deliberately: a Mac keyboard on Linux is a real
  // thing, and nothing in the table wants ⌘ and Ctrl to mean different things.
  if ((shortcut.mod ?? false) !== (event.metaKey || event.ctrlKey)) return false;
  if (!plus && (shortcut.shift ?? false) !== event.shiftKey) return false;
  return (shortcut.alt ?? false) === event.altKey;
}

/** How Tauri's menu builder wants an accelerator: `"CmdOrCtrl+Shift+S"`. */
export function acceleratorFor(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push("CmdOrCtrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(ACCELERATOR_KEYS[shortcut.key] ?? shortcut.key.toUpperCase());
  return parts.join("+");
}

/** muda's names for the keys whose `KeyboardEvent.key` spelling it does not take. */
const ACCELERATOR_KEYS: Record<string, string> = {
  "=": "Equal",
  "-": "Minus",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
};

/**
 * How a person reads it. Glyphs on macOS — where a menu that spelled out
 * "Cmd+Shift+S" would be the only one on the machine doing so — and words
 * elsewhere. The arrows are glyphs on both, because ↓ is what the key says.
 */
export function displayShortcut(shortcut: Shortcut, mac: boolean = isMac()): string {
  const parts: string[] = [];
  if (mac) {
    // macOS orders its modifiers ⌃⌥⇧⌘, always, whatever order they were written.
    if (shortcut.alt) parts.push("⌥");
    if (shortcut.shift) parts.push("⇧");
    if (shortcut.mod) parts.push("⌘");
    return `${parts.join("")}${displayKey(shortcut.key)}`;
  }
  if (shortcut.mod) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(displayKey(shortcut.key));
  return parts.join("+");
}

const DISPLAY_KEYS: Record<string, string> = { arrowup: "↑", arrowdown: "↓" };

/** The label on the key cap, which is the same on every keyboard. */
function displayKey(key: string): string {
  const glyph = DISPLAY_KEYS[key];
  if (glyph) return glyph;
  // `=` is what the keyboard sends and `+` is what the key is called: a menu shows
  // the cap, not the character the key produces unshifted.
  return (key === "=" ? "+" : key).toUpperCase();
}

/** Whether this is a Mac — the only thing the *display* has to branch on. */
export function isMac(scope: typeof globalThis = globalThis): boolean {
  const platform =
    (scope.navigator as { userAgentData?: { platform?: string } } | undefined)?.userAgentData
      ?.platform ??
    scope.navigator?.platform ??
    "";
  return /mac/i.test(platform);
}
