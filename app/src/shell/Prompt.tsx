/**
 * The Prompt: a question that blocks until the user answers it (`CONTEXT.md`).
 *
 * Two of #1100's three Prompts are this component — "Save changes to…?" and
 * "Overwrite…?" — and both are asked from the middle of an operation that
 * cannot continue without the answer, so {@link usePrompt} hands back a promise
 * rather than a callback. The third, Restore, is a list rather than a question
 * and has its own component.
 *
 * A real `<dialog>` opened with `showModal()` (#1101 guard 4): focus containment,
 * the inert backdrop, Escape and focus restoration are all the browser's, and a
 * hand-rolled focus trap is the most reliably-broken thing in this category.
 *
 * Return and Escape are separate, which an earlier version of this file thought
 * `<dialog>` made impossible: Return activates the focused button — the default
 * choice, which `autofocus` puts the cursor on — while Escape arrives as the
 * dialog's own `cancel` event and is answered with the escape choice. Prompt B
 * needs both to be `Cancel` and Prompt A needs them to differ; this gives either.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface PromptChoice {
  /** What the answer is, to the code that asked. */
  readonly id: string;
  readonly label: string;
}

export interface PromptRequest {
  readonly title: string;
  readonly body?: string;
  readonly choices: readonly PromptChoice[];
  /** The choice Return reaches, and the one that starts focused. */
  readonly defaultChoice: string;
  /** The choice Escape reaches. Always a way out that changes nothing. */
  readonly escapeChoice: string;
}

/** A Prompt waiting to be answered, and who is waiting for it. */
interface Pending {
  readonly request: PromptRequest;
  readonly answer: (choice: string) => void;
}

export interface PromptHost {
  /** The Prompt on screen, if any — hand this to {@link Prompt}. */
  readonly pending: Pending | null;
  /** Ask, and wait. Resolves with the id of the choice the user made. */
  readonly ask: (request: PromptRequest) => Promise<string>;
}

/**
 * Ask a question and wait for the answer.
 *
 * One at a time, deliberately: every Prompt here interrupts an operation the
 * user started, so a second question while the first is unanswered would mean
 * two operations running at once on one Document. A Prompt asked while another
 * is open answers itself with its own Escape choice, which is the answer that
 * changes nothing.
 */
export function usePrompt(): PromptHost {
  const [pending, setPending] = useState<Pending | null>(null);
  // Read in `ask` without making it depend on the state it reads, so the
  // callback identity is stable for everything that closes over it.
  const open = useRef(false);

  const ask = useCallback((request: PromptRequest) => {
    if (open.current) return Promise.resolve(request.escapeChoice);
    open.current = true;
    return new Promise<string>((resolve) => {
      setPending({
        request,
        answer: (choice) => {
          open.current = false;
          setPending(null);
          resolve(choice);
        },
      });
    });
  }, []);

  return { pending, ask };
}

export interface PromptProps {
  readonly pending: Pending | null;
}

export function Prompt({ pending }: PromptProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Opened and closed through the element's own methods, which is what makes it
  // modal: React only renders the markup.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (pending && !element.open) element.showModal();
    if (!pending && element.open) element.close();
  }, [pending]);

  if (!pending) return null;
  const { request } = pending;

  return (
    <dialog
      className="prompt"
      ref={dialog}
      data-testid="prompt"
      aria-labelledby="prompt-title"
      aria-describedby={request.body ? "prompt-body" : undefined}
      // Escape, as the browser reports it. Answered rather than swallowed: the
      // operation that asked is waiting, and the escape choice is the answer that
      // changes nothing.
      onCancel={(event) => {
        event.preventDefault();
        pending.answer(request.escapeChoice);
      }}
    >
      <h2 className="prompt__title" id="prompt-title">
        {request.title}
      </h2>
      {request.body && (
        <p className="prompt__body" id="prompt-body">
          {request.body}
        </p>
      )}
      <div className="prompt__choices">
        {request.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            data-testid={`prompt-${choice.id}`}
            data-default={choice.id === request.defaultChoice ? "true" : undefined}
            // The choice Return reaches, because Return activates the focused
            // button and this is the one focus starts on.
            // biome-ignore lint/a11y/noAutofocus: a modal's own default button is where focus belongs (#1101 guard 4)
            autoFocus={choice.id === request.defaultChoice}
            onClick={() => pending.answer(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
