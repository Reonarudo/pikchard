/**
 * The corpus Scripts that do not parse clean, in two lists that mean different
 * things (ADR 0011).
 *
 * Neither list is `pikchr-wasm`'s `errors.txt`, and they must never be shared
 * with it: most of its render-error cases parse perfectly clean here, because
 * they are *semantic* errors, and a grammar only sees syntax.
 *
 * A pin bump that brings in an unparseable Script fails `conformance.test.ts`.
 * That is deliberate. It is fixed, or it is added below *with a reason* by the
 * person doing the bump — never recorded automatically, which would let the
 * list fill itself and stop meaning anything.
 */

/**
 * Scripts that *must* produce error nodes, because they are not valid Pikchr
 * and a grammar that accepted them would be wrong. Asserted positively.
 */
export const EXPECTED_REJECTIONS: Readonly<Record<string, string>> = {
  "fuzzcases/divzero.pikchr":
    "Genuinely malformed: it ends mid-attribute on a bare `box wid`, with no value for the " +
    "width. Upstream keeps it as a fuzz case precisely because pikchr rejects it.",
};

/**
 * Accepted limitations — Scripts valid Pikchr accepts that this grammar does
 * not. Each one is a decision, not a bug left lying around.
 *
 * Empty, and that is the honest answer rather than a boast. The two Scripts
 * #1040 expected to land here — `tests/test60` and `tests/test62` — both parse
 * clean, and should:
 *
 * - `tests/test60` calls `xyz abc`, whose Macro bodies are each a *complete*
 *   statement. The "Macro expanding to a fragment of a statement" gap ADR 0007
 *   records is real, but this Script is not an instance of it; upstream's
 *   error is raised at expansion time, over a Macro redefined four times.
 * - `tests/test62` hides `error "hello"` 236 lines in. Syntactically that is a
 *   Macro call with a text Attribute, which is a shape this grammar has to
 *   accept — upstream's complaint is that no Macro named `error` was ever
 *   defined, which is semantics.
 *
 * Both fall out of the `MacroCall` production carrying its own AttributeList,
 * which ADR 0007 requires (without it `pill("x") at last box` fails). A
 * grammar that cannot expand Macros cannot tell a Macro call from a typo, and
 * that is the price the ADR already accepted.
 */
export const KNOWN_GAPS: Readonly<Record<string, string>> = {};
