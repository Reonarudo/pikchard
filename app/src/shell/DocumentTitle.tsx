/**
 * The Document's Name in the top bar, and the Unsaved dot beside it (#1047).
 *
 * The dot is a pure function of Unsaved and of nothing else: it never reports
 * whether the Draft has been written, because there is no "saving…" and no "all
 * changes saved" anywhere in Pikchard (#1054). An Untitled Document reads
 * "Untitled", which is its Name.
 */

import { COPY } from "../copy.js";

export interface DocumentTitleProps {
  readonly name: string;
  readonly unsaved: boolean;
}

/** What the window, or the tab, is called — the same reading, in one line. */
export function windowTitle(name: string, unsaved: boolean): string {
  return `${unsaved ? "• " : ""}${name} — Pikchard`;
}

export function DocumentTitle({ name, unsaved }: DocumentTitleProps) {
  return (
    <span className="app__document" data-testid="document-title">
      {name}
      {unsaved && (
        // Named, not just drawn: the dot is the only thing that says the
        // Document has changes, and a screen reader cannot see it (#1101).
        <span
          className="app__unsaved"
          data-testid="unsaved-dot"
          role="img"
          aria-label={COPY.unsavedLabel}
        />
      )}
    </span>
  );
}
