/**
 * The status bar's Script cell, Render cell and zoom reading (#1019, #1016,
 * #1017).
 *
 * The Render cell has two states and no third: the Render is synchronous, so
 * "Rendering…" is a state that cannot occur and the cell is either the time the
 * last Render took or where the current one failed. The failure is a button,
 * because the one thing a user wants from an error position is to be taken there.
 *
 * The cursor position belongs to this bar too, but to #1023 — this is the part
 * #1019, #1016 and #1017 own.
 */

import { COPY } from "../copy.js";
import type { ScriptProjection } from "../document/projection.js";
import type { CursorPosition } from "../editor/Editor.js";
import type { PanZoom } from "../preview/panzoom.js";
import { zoomPercent } from "../preview/panzoom.js";
import { formatPosition } from "../render/position.js";
import type { PresentedError } from "../render/presentation.js";
import type { Theme } from "../store.js";
import { ScriptSelector } from "./ScriptSelector.js";

export interface StatusBarProps {
  /** Where the cursor is, counting from one (#1023). */
  readonly cursor: CursorPosition;
  /** The theme, which the bar names because #1047 put it here. */
  readonly theme: Theme;
  /** How long the last Render of the Active Script took. */
  readonly elapsedMs: number | null;
  /** The Render Error, once it may be presented (#1017). */
  readonly error: PresentedError | null;
  readonly panzoom: PanZoom;
  /** The Scripts, for the selector: how many there are and which is Active. */
  readonly scripts: ScriptProjection;
  /** Put the cursor on the error — what clicking the cell is for. */
  readonly onJumpToError: () => void;
  /** Take the cursor into Script `index`, zero-based (#1019). */
  readonly onJumpToScript: (index: number) => void;
}

export function StatusBar({
  cursor,
  theme,
  elapsedMs,
  error,
  panzoom,
  scripts,
  onJumpToError,
  onJumpToScript,
}: StatusBarProps) {
  return (
    /* A `<footer>`, and never a live region: `Ln 3, Col 5` on every cursor move
       would be an announcement per keystroke (#1101 guard 10). */
    <footer className="status" data-testid="status-bar">
      <span data-testid="status-cursor">{COPY.cursorAt(cursor.line, cursor.col)}</span>
      <ScriptSelector
        count={scripts.count}
        activeIndex={scripts.activeIndex}
        onJump={onJumpToScript}
      />
      {error ? (
        <button
          type="button"
          className="status__error"
          onClick={onJumpToError}
          data-testid="status-render"
        >
          {COPY.errorAt(formatPosition(error.position))}
        </button>
      ) : (
        elapsedMs !== null && <span data-testid="status-render">{COPY.renderedIn(elapsedMs)}</span>
      )}
      <span className="status__spacer" />
      <span data-testid="status-zoom">
        {zoomPercent(panzoom.viewport)}
        {panzoom.manual ? "" : ` · ${COPY.fitting}`}
      </span>
      <span data-testid="status-theme">{theme === "light" ? COPY.themeLight : COPY.themeDark}</span>
    </footer>
  );
}
