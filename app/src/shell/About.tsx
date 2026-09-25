/**
 * About Pikchard (#1023, #1100, #1101).
 *
 * Four lines and no more: the app's version, the pinned pikchr version, the
 * repository, and the two licences. No credits, no acknowledgements and **no
 * "Check for updates"** — the service worker owns updates (#1025). The pikchr
 * version is here because it is the one fact a bug report needs and the one a user
 * cannot otherwise obtain.
 *
 * A real `<dialog>` opened with `showModal()`, which is #1101 guard 4: focus
 * containment, Escape, the inert backdrop and focus restoration all come from the
 * browser, and a hand-rolled focus trap is the most reliably-broken thing in this
 * category.
 */

import { useEffect, useRef } from "react";
import { COPY } from "../copy.js";
import { APP_VERSION } from "../version.js";

export interface AboutProps {
  readonly open: boolean;
  /** The pinned pikchr version, once the renderer has loaded. */
  readonly pikchrVersion: string | null;
  readonly onClose: () => void;
  /** Open the repository outside the app, the way the manual is opened. */
  readonly onOpenRepository: () => void;
}

export function About({ open, pikchrVersion, onClose, onOpenRepository }: AboutProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // Focused here rather than with `autoFocus`: this dialog is in the tree from
      // the start and only *opened* later, so a mount-time focus would have fired
      // while it was still hidden.
      close.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    /* `onClose` catches Escape as well as the button, because the browser closes
       the dialog itself and the app has to hear about it either way. */
    <dialog className="about" ref={dialog} data-testid="about" onClose={onClose}>
      <h2 className="about__title">{COPY.aboutTitle}</h2>
      <p className="about__line" data-testid="about-version">
        {COPY.aboutVersion(APP_VERSION)}
      </p>
      <p className="about__line" data-testid="about-pikchr">
        {COPY.aboutPikchr(pikchrVersion ?? "…")}
      </p>
      <p className="about__line">
        {/* A button rather than an anchor: on the desktop a link would navigate
            the webview away from the app, so opening it is the Platform's job. */}
        <button
          type="button"
          className="about__link"
          data-testid="about-repository"
          onClick={onOpenRepository}
        >
          {COPY.aboutRepository}
        </button>
      </p>
      <p className="about__line">{COPY.aboutLicence}</p>
      <div className="about__choices">
        {/* Focused when the dialog opens, so Return and Escape do the same
            harmless thing in the only dialog with one button. */}
        <button type="button" ref={close} data-testid="about-close" onClick={onClose}>
          {COPY.close}
        </button>
      </div>
    </dialog>
  );
}
