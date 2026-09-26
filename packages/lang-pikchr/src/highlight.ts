/**
 * What each node kind is coloured as.
 *
 * Pikchr's vocabulary does not map onto a general-purpose highlighter's tags
 * one-for-one, so the choices worth knowing are written down here rather than
 * left to be reverse-engineered from a theme:
 *
 * - a **Label** (`A:`) is a definition, and every later `A` is a variable
 *   name, because that is how a reader tells the two apart at a glance;
 * - the fourteen **class names** are types, not keywords — `box` names what a
 *   thing *is*, while `at` and `then` say what to *do*;
 * - **`$1`…`$9`** are special variable names, which is what makes a Macro body
 *   read differently from the statements around it.
 */

import { styleTags, tags as t } from "@lezer/highlight";

export const pikchrHighlighting = styleTags({
  Comment: t.lineComment,
  String: t.string,
  Number: t.number,
  Ordinal: t.number,
  Parameter: t.special(t.variableName),

  ClassName: t.typeName,
  "up down left right": t.controlKeyword,
  "print assert define": t.definitionKeyword,

  // Where an Object goes and how it gets there.
  "at with from to then go close chop even until behind same as": t.keyword,
  "heading of the way between and in this vertex first last previous": t.keyword,
  "above below center ljust rjust aligned fit": t.keyword,

  // What an Object looks like.
  "height ht width wid radius rad diameter thickness": t.propertyName,
  "dotted dashed solid thick thin invis invisible": t.propertyName,
  "fill color cw ccw": t.propertyName,
  "italic bold mono monospace big small": t.propertyName,

  "Func1/... Func2/... dist": t.function(t.variableName),

  // An Anchor is only an Anchor where one is grammatical. `EdgePt` also
  // stands in for a Variable name — that is what `%fallback ID EDGEPT` buys —
  // so tagging the token itself would colour `n = 3` as a compass point.
  "Edge/... Withclause/Edge/...": t.attributeName,
  "Attribute/EdgePt Position/EdgePt": t.attributeName,
  "Expr/x Expr/y": t.attributeName,
  // Everywhere else a compass word is standing in for a Variable name, and
  // this rule has to be here rather than left to `Id` below: a node that has
  // rules but matches none of them takes no colour at all, inherited or not.
  EdgePt: t.variableName,

  // Each name is tagged on its own node, never on its descendants: two rules
  // that both match end up stacking their classes on one token.
  "LabelledStatement/PlaceName": t.definition(t.labelName),
  "DefineStatement/Id": t.definition(t.macroName),
  "Assignment/Lvalue": t.definition(t.variableName),
  "MacroCall/Id": t.macroName,
  PlaceName: t.labelName,
  Id: t.variableName,

  LArrow: t.operator,
  RArrow: t.operator,
  LRArrow: t.operator,
  Assign: t.definitionOperator,
  Eq: t.compareOperator,

  // Pikchr's arithmetic operators are anonymous literal tokens, and `*` and
  // `/` are both metacharacters in a `styleTags` path, so they cannot be named
  // here. Brackets are left alone too: `@detectDelim` already gives them to
  // bracket matching, which is what a reader actually uses them for.
});
