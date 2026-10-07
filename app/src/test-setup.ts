/**
 * What jsdom is missing, and only that.
 *
 * jsdom implements `<dialog>` as an element but not its modality: `showModal` and
 * `close` simply are not there. The app uses a real `<dialog>` deliberately —
 * #1101 guard 4 wants the browser's focus containment rather than a hand-rolled
 * trap — so the shim belongs to the test environment, never to the app.
 *
 * It is the *behaviour a test can assert* and no more: `open` flips, `close` fires
 * a `close` event, and Escape closes. Focus containment and the inert backdrop are
 * the browser's, and are covered in Playwright instead.
 */

const dialog = globalThis.HTMLDialogElement?.prototype as
  | (HTMLDialogElement & { showModal?: () => void })
  | undefined;

if (dialog && typeof dialog.showModal !== "function") {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Escape is part of a modal dialog's behaviour, and the app answers the
    // `cancel` event it raises — so the shim has to raise it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !this.hasAttribute("open")) return;
      const cancel = new Event("cancel", { cancelable: true });
      this.dispatchEvent(cancel);
      if (!cancel.defaultPrevented) this.close();
    };
    this.ownerDocument.addEventListener("keydown", onKeyDown);
    this.addEventListener(
      "close",
      () => this.ownerDocument.removeEventListener("keydown", onKeyDown),
      {
        once: true,
      },
    );
  };
  dialog.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
  };
}
