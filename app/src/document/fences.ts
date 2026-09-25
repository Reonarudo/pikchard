/**
 * The one predicate that decides whether a Markdown Fence holds a Script
 * (ADR 0008).
 *
 * It drives both the `codeLanguages` hook that nests `lang-pikchr` into the
 * Fence and the Script list derived from the same tree, so what is highlighted
 * and what is rendered can never disagree. The rest of the info string —
 * `{x}`, `source-ranges`, anything else a Markdown renderer cares about — is
 * not ours to read, and is preserved verbatim.
 */

const PIKCHR_TAG = "pikchr";

/**
 * True when the Fence's info string tags it as Pikchr: its first word is
 * `pikchr`, compared case-insensitively.
 *
 * A word, not a prefix — `pikchrx` and `pikchr-lite` are some other language.
 * An untagged Fence that happens to hold Pikchr is not detected; guessing
 * would render a shell snippet as a diagram.
 */
export function isPikchrInfoString(info: string): boolean {
  const firstWord = info.trim().split(/\s+/, 1)[0] ?? "";
  return firstWord.toLowerCase() === PIKCHR_TAG;
}
