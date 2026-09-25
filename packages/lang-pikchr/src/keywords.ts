/**
 * Pikchr's keyword lists, as plain data the Lezer grammar and highlighting can
 * both read.
 *
 * Each list below is complete for its own category. There is deliberately no
 * aggregate "all keywords" export yet: Pikchr's attribute and expression
 * keywords (`at`, `then`, `same`, `color`, `fill`, `thickness`, …) are settled
 * by writing the grammar against upstream `pikchr.y`, so they arrive with it in
 * #1040 rather than being guessed at here.
 */

/** Classes of Object a statement can draw. */
export const OBJECT_CLASSES = [
  "arc",
  "arrow",
  "box",
  "circle",
  "cylinder",
  "diamond",
  "dot",
  "ellipse",
  "file",
  "line",
  "move",
  "oval",
  "spline",
  "text",
] as const;

/** The layout directions a Script can be in. */
export const DIRECTIONS = ["down", "left", "right", "up"] as const;

/** Keywords that introduce a statement which draws no Object. */
export const STATEMENT_KEYWORDS = ["assert", "define", "print"] as const;
