/**
 * What Pikchard will open (#1018).
 *
 * The *rule* is decided here and nowhere else — every route a file arrives by asks
 * `isSupportedDocumentName`. The Chromium picker's `accept` map in `browser.ts`
 * lists the same extensions again, grouped by MIME type, because that is the shape
 * the picker takes; it is a filter the user can reach past, so the rule here is
 * still what decides.
 *
 * The rule is about the **name** and never the contents: a file is offered by
 * the OS long before it can be read — on argv, in a drop, as an "open with" —
 * and the refusal has to happen before Pikchard commits to reading it. Sniffing
 * would also refuse the empty file the user just created, which is a file they
 * are entitled to start a Script in.
 *
 * `.txt` is here because the Open dialog filters by it: a Script pasted into a
 * `notes.txt` is still a Script. It is deliberately *not* an association on the
 * desktop — Pikchard does not want every text file on the machine (#1057).
 */

/**
 * The extensions the dialogs filter by and the drops are judged against,
 * dot-free because that is the form Tauri's dialog filters take. Pikchr's own
 * two first, since they are what Pikchard owns outright.
 */
export const DOCUMENT_EXTENSIONS = Object.freeze([
  "pikchr",
  "pik",
  "md",
  "markdown",
  "txt",
] as const);

/** The same list in the dotted form the browser's pickers want. */
export const DOTTED_DOCUMENT_EXTENSIONS = Object.freeze(
  DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`),
);

/**
 * Whether Pikchard opens a file of this name. Takes a bare Name or a whole
 * path — the OS hands over both, and the extension is read off the last
 * segment so a directory called `v1.md` never speaks for the file inside it.
 */
export function isSupportedDocumentName(name: string): boolean {
  const extension = extensionOf(name).toLowerCase();
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension);
}

/** `"/tmp/a.MD"` -> `"MD"`; `""` where the last segment has no dot. */
function extensionOf(name: string): string {
  const segment = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = segment.lastIndexOf(".");
  return dot === -1 ? "" : segment.slice(dot + 1);
}
