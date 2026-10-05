/**
 * The two questions Pikchard asks, in the words #1100 settled on.
 *
 * They are here rather than at their call sites so that the wording, the button
 * order and — above all — which button Return and Escape reach can be read and
 * tested in one place. Both of those defaults are decisions, not conventions.
 */

import { COPY } from "../copy.js";
import type { PromptRequest } from "./Prompt.js";

export const SAVE = "save";
export const DONT_SAVE = "dont-save";
export const CANCEL = "cancel";
export const OVERWRITE = "overwrite";

/**
 * **Prompt A**: something is about to replace or close an Unsaved Document.
 *
 * Return reaches `Save`, which is the answer that loses nothing at all. Escape
 * reaches `Cancel`, which does not even replace the Document. `Don't save`
 * keeps the work in Pikchard — the body line is what tells the user so, and is
 * not optional (#1100).
 */
export function saveChangesPrompt(name: string, untitled: boolean): PromptRequest {
  return {
    title: untitled ? COPY.saveChangesUntitled : COPY.saveChangesTo(name),
    body: COPY.saveChangesBody,
    choices: [
      { id: SAVE, label: COPY.save },
      { id: DONT_SAVE, label: COPY.dontSave },
      { id: CANCEL, label: COPY.cancel },
    ],
    defaultChoice: SAVE,
    escapeChoice: CANCEL,
  };
}

/**
 * **Prompt B**: the file changed under Pikchard since it was opened.
 *
 * `Cancel` is what *both* Return and Escape reach. This is the only destructive
 * Prompt in the app, and what it destroys is work Pikchard cannot see and
 * cannot get back, so the safe answer is the one a reflex produces (#1100).
 */
export function overwritePrompt(name: string): PromptRequest {
  return {
    title: COPY.overwrite(name),
    body: COPY.overwriteBody,
    choices: [
      { id: OVERWRITE, label: COPY.overwriteConfirm },
      { id: CANCEL, label: COPY.cancel },
    ],
    defaultChoice: CANCEL,
    escapeChoice: CANCEL,
  };
}
