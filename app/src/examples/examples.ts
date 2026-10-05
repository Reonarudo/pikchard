/**
 * The bundled Examples (#1044, #1061).
 *
 * Product content and not test material: one `.pikchr` file each, in this
 * directory, pulled in by a build-time glob so adding an Example is adding a
 * file. Written by us, never taken from upstream's `doc/examples.md`, which is
 * unlicensed prose (ADR 0004).
 *
 * The **New-Document seed is not an Example** — an Example is what the Examples
 * menu opens (`CONTEXT.md`) — so it stays a constant beside the New Command
 * (`store.ts`) rather than becoming a ninth file here.
 *
 * Playwright is welcome to use these as fixtures; that is a convenience and must
 * never constrain which Examples ship (#1061).
 */

/** An Example: what the menu calls it, and the Script it opens. */
export interface Example {
  readonly name: string;
  readonly script: string;
}

/**
 * Every `.pikchr` in this directory, in filename order — which is why the files
 * are numbered: the menu lists them in bundle order, and the order is a teaching
 * order, from two boxes to text styling.
 *
 * `eager` because eight small Scripts are a few kilobytes and a menu that has to
 * await a chunk before it can list itself would be worse in every way.
 */
const FILES: Record<string, string> = import.meta.glob("./*.pikchr", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const EXAMPLES: readonly Example[] = Object.keys(FILES)
  .sort()
  .map((path) => ({ name: exampleName(path), script: FILES[path] as string }));

/**
 * `./02-flowchart.pikchr` → `Flowchart`.
 *
 * The filename is the name, so there is no manifest to keep in step with the
 * directory: the number orders it and the words are the title, sentence-cased the
 * way every other label in the app is.
 */
export function exampleName(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1).replace(/\.pikchr$/, "");
  const words = file.replace(/^\d+-/, "").split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
