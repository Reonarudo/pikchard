/**
 * The brackets the editor closes and matches (#1015).
 *
 * Only the brackets: the rest of what #1015 asks of the editor — Toggle
 * Comment on `#`, and the indentation a new line inherits — needs no extension
 * of its own, because `defaultKeymap` already binds both and both read the
 * language data `lang-pikchr` declares.
 *
 * These two know nothing of Pikchr either. They read `closeBrackets` at the
 * cursor, so they do the Pikchr thing inside a Fence and the Markdown thing in
 * the prose around it, with no second answer to keep in step.
 */

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { bracketMatching } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export const bracketEditing: Extension = [
  closeBrackets(),
  bracketMatching(),
  // Backspace between a freshly closed pair should take both halves, so this
  // binding has to be reached before the plain Backspace of `defaultKeymap` —
  // which is why the Editor installs this extension ahead of its keymaps.
  keymap.of(closeBracketsKeymap),
];
