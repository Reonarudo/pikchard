import { describe, expect, it } from "vitest";
import { errorSpans, parseScript } from "./tree.js";

// A Macro parameter can stand for any category at all, so once a body is
// parsed rather than kept opaque (ADR 0007), `$1`…`$9` have to be grammatical
// wherever a token can appear — as an expression, as an attribute value, as a
// whole attribute, as a position, and as the name in `define $1 { … }`.
//
// Bodies that only make sense *after* substitution still degrade to error
// nodes; what must never happen is a `$1` in an ordinary place breaking the
// highlighting of the statements around it.

const clean = (script: string) => errorSpans(parseScript(script));

describe("a Macro parameter", () => {
  it.each([
    ["as a numeric attribute value", "define m { box wid $1 }"],
    ["as a colour attribute value", "define m { circle fill $1 }"],
    ["inside an expression", "define m { dx = $1 + 1 }"],
    ["as an operand of every arithmetic operator", "define m { dx = $1 * 2 - $2 / $3 }"],
    ["as a whole attribute", "define m { box $1 }"],
    ["as a whole position", "define m { box at $1 }"],
    ["inside a String", 'define m { box "$1" }'],
    ["as a coordinate", "define m { box at ($1, $2) }"],
    ["as the radius and the height at once", "define m { box rad $1 ht $2 }"],
    ["as the name of the Macro itself", "define $1 { box }"],
    ["several times over in one body", 'define m { box "$1" wid $2 at ($3, $4) }'],
  ])("is grammatical %s", (_, script) => {
    expect(clean(script)).toEqual([]);
  });

  it("does not need a Macro body to be legal — pikchr only substitutes there", () => {
    // Outside a body `$1` is simply a Variable-shaped token in an expression.
    // The grammar has no way to know it will never be substituted, and saying
    // so is a Lint's job (#1028), not the grammar's.
    expect(clean("box wid $1")).toEqual([]);
  });

  it("still marks a body that is broken for reasons other than the parameter", () => {
    expect(clean("define m { box wid wid wid at at }").length).toBeGreaterThan(0);
  });
});
