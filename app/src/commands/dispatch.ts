/**
 * How a keystroke reaches a Command (#1023, #1053).
 *
 * Twice over, because the keyboard has two owners. Inside the editor CodeMirror
 * sees the event first and its keymaps are the precedence order that matters, so
 * the app's Shortcuts go in as a high-precedence keymap extension. Everywhere
 * else — the focus in the Preview, on a toolbar button, on the body — there is a
 * `window` listener, and it **ignores anything aimed inside the editor** so no
 * Command can run twice.
 *
 * Both paths end in `COMMANDS[id].run(ctx)` and both respect `enabled`, so a
 * Shortcut cannot do what its own menu item is greyed out for.
 */

import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { useEffect } from "react";
import type { PlatformKind } from "../platform/types.js";
import { type Command, type CommandContext, SHORTCUT_COMMANDS, shortcutOf } from "./registry.js";
import { matchesShortcut, type Shortcut } from "./shortcut.js";

/** Run a Command if the context allows it. The only route either path takes. */
function runIfEnabled(command: Command, ctx: CommandContext): void {
  if (command.enabled(ctx)) command.run(ctx);
}

/** A Shortcut in CodeMirror's own key notation: `{mod, shift, key:"e"}` → `Mod-Shift-e`. */
export function codeMirrorKey(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push("Mod");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(CODEMIRROR_KEYS[shortcut.key] ?? shortcut.key);
  return parts.join("-");
}

const CODEMIRROR_KEYS: Record<string, string> = { arrowup: "ArrowUp", arrowdown: "ArrowDown" };

/**
 * The app's Shortcuts as an editor extension, at the highest precedence.
 *
 * `Prec.highest` because `standardKeymap` and `defaultKeymap` are already
 * installed and a later keymap would lose to them; the collision test in
 * `registry.test.ts` is what makes that safe rather than lucky.
 */
export function commandKeymap(ctx: () => CommandContext, kind: PlatformKind): Extension {
  return Prec.highest(
    keymap.of(
      SHORTCUT_COMMANDS.flatMap((command) => {
        const shortcut = shortcutOf(command, kind);
        if (!shortcut) return [];
        return [
          {
            key: codeMirrorKey(shortcut),
            preventDefault: true,
            // `true` whether or not the Command could act: the key is claimed
            // either way, so Mod+E with nothing to export never falls through to
            // the browser's own binding.
            run: () => {
              runIfEnabled(command, ctx());
              return true;
            },
          },
        ];
      }),
    ),
  );
}

/**
 * The same Shortcuts for everywhere that is not the editor.
 *
 * Events aimed inside the editor are left alone: CodeMirror's keymap above has
 * them, and handling them here as well would run every Command twice.
 */
export function useCommandShortcuts(ctx: () => CommandContext, kind: PlatformKind): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".cm-editor")) return;

      for (const command of SHORTCUT_COMMANDS) {
        const shortcut = shortcutOf(command, kind);
        if (!shortcut || !matchesShortcut(event, shortcut)) continue;
        // Claimed before the browser can act on it: the web build's Mod+S is
        // "Save Page As" and its Mod+O opens a file *over* Pikchard.
        event.preventDefault();
        runIfEnabled(command, ctx());
        return;
      }
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [ctx, kind]);
}
