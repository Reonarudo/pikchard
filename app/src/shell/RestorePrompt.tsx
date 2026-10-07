/**
 * **Prompt C** — the unsaved work from last time (#1100).
 *
 * Shown only on a cold launch with no Document to open: a launch that carries a
 * file opens it and skips this, and the work survives to the next plain launch
 * (#1054). One row per Document whose text still differs from its Baseline,
 * decided from the stored Baseline alone and never by reading the file.
 *
 * The word *Draft* is not here and must never arrive: what the user has is
 * unsaved work, and the times are relative rather than stamped.
 */

import { useEffect, useRef } from "react";
import { COPY } from "../copy.js";
import type { Draft } from "../document/drafts.js";

export interface RestorePromptProps {
  /** The restorable Drafts, newest first. Nothing is shown for an empty list. */
  readonly drafts: readonly Draft[];
  readonly onRestore: (draft: Draft) => void;
  readonly onDiscard: (draft: Draft) => void;
  readonly onDiscardAll: () => void;
  /** Injected only by the tests, so "2 hours ago" can be a fact. */
  readonly now?: number;
}

export function RestorePrompt({
  drafts,
  onRestore,
  onDiscard,
  onDiscardAll,
  now,
}: RestorePromptProps) {
  const box = useRef<HTMLDialogElement>(null);

  // The same real modality the other Prompts have (#1101 guard 4). This one is
  // shown at launch, which is the one moment the app takes focus before the user
  // has done anything — and `<dialog>` is what hands it back afterwards.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    if (drafts.length > 0 && !element.open) element.showModal();
    if (drafts.length === 0 && element.open) element.close();
  }, [drafts.length]);

  if (drafts.length === 0) return null;

  // One Draft degenerates to the plain question: there is nothing to choose
  // between, so a list of one would only make the user read a row to find it.
  const single = drafts.length === 1 ? drafts[0] : null;

  return (
    <dialog
      className="prompt"
      ref={box}
      data-testid="restore-prompt"
      aria-labelledby="restore-title"
    >
      <div>
        <h2 className="prompt__title" id="restore-title">
          {COPY.unsavedWorkTitle}
        </h2>

        {single ? (
          <>
            <p className="prompt__body">
              {COPY.unsavedWorkRow(single.name, COPY.timeAgo(single.at, now))}
            </p>
            <div className="prompt__choices">
              <button
                type="button"
                data-testid="restore"
                data-default="true"
                // biome-ignore lint/a11y/noAutofocus: the modal's default choice (#1101 guard 4)
                autoFocus
                onClick={() => onRestore(single)}
              >
                {COPY.restore}
              </button>
              <button type="button" data-testid="discard" onClick={() => onDiscard(single)}>
                {COPY.discard}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="prompt__rows">
              {drafts.map((draft) => (
                <li key={draft.key} className="prompt__row">
                  {/* The row itself Restores: picking the work is the point,
                      and Discard is the exception beside it. */}
                  <button
                    type="button"
                    className="prompt__pick"
                    /* The newest row is where focus lands: the most recent
                       work is the likeliest thing to be wanted back. */
                    data-default={draft === drafts[0] ? "true" : undefined}
                    // biome-ignore lint/a11y/noAutofocus: the modal's default choice (#1101 guard 4)
                    autoFocus={draft === drafts[0]}
                    data-testid={`restore-${draft.key}`}
                    onClick={() => onRestore(draft)}
                  >
                    {COPY.unsavedWorkRow(draft.name, COPY.timeAgo(draft.at, now))}
                  </button>
                  <button
                    type="button"
                    data-testid={`discard-${draft.key}`}
                    onClick={() => onDiscard(draft)}
                  >
                    {COPY.discard}
                  </button>
                </li>
              ))}
            </ul>
            <div className="prompt__choices">
              <button type="button" data-testid="discard-all" onClick={onDiscardAll}>
                {COPY.discardAll}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
