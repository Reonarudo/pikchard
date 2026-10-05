/**
 * Reading a parsed Script: the questions the rest of Pikchard asks of the
 * tree.
 *
 * Everything here works on a `Tree`, never on a CodeMirror `EditorState`, so
 * the Script ↔ Diagram map, the Lints and the tests can all use it without a
 * running editor.
 */

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "../parser/pikchr.js";

/** A start/end offset range within a Script. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

/** What a Script defines by name and can refer to later. */
export type SymbolKind = "label" | "variable" | "macro";

export interface Symbol {
  readonly kind: SymbolKind;
  /** `A`, `$dx`, `pill` — exactly the text that defines it. */
  readonly name: string;
  /** The Span of the name, not of the statement that defines it. */
  readonly span: Span;
}

/** Parse a Script on its own, outside any editor. */
export function parseScript(text: string): Tree {
  return parser.parse(text);
}

const spanOf = (node: { from: number; to: number }): Span => ({ from: node.from, to: node.to });

/**
 * Where the parse went wrong, innermost first at each point.
 *
 * Lezer reports a failure both as `⚠` nodes it inserted and by marking the
 * node it could not finish; both are error nodes, and both are worth a
 * Diagnostic, so both are here.
 */
export function errorSpans(tree: Tree): readonly Span[] {
  const spans: Span[] = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError) spans.push(spanOf(node));
    },
  });
  return spans;
}

/**
 * The Statement containing `offset`, or `undefined` when the offset is between
 * statements — in the whitespace after a `;`, say.
 *
 * A Statement nested in a Sublist or a Macro body wins over the Statement that
 * encloses it: the innermost one is the one the cursor is really in.
 */
export function statementAt(tree: Tree, offset: number): SyntaxNode | undefined {
  let node: SyntaxNode | null = tree.resolveInner(offset, -1);
  let statement: SyntaxNode | undefined;
  while (node) {
    if (node.name === "Statement") {
      statement = node;
      break;
    }
    node = node.parent;
  }
  return statement;
}

/**
 * The three statements that define a Symbol, and where each one keeps the
 * name. Kept as one table rather than two cascades so a fourth kind cannot be
 * half-added.
 *
 * A Macro can be named by a Parameter — `define $1 { … }` is legal — which is
 * why that one lists two nodes.
 */
const DEFINITIONS: Readonly<Record<string, { kind: SymbolKind; name: readonly string[] }>> = {
  LabelledStatement: { kind: "label", name: ["PlaceName"] },
  Assignment: { kind: "variable", name: ["Lvalue"] },
  DefineStatement: { kind: "macro", name: ["Id", "Parameter"] },
};

/**
 * Every Symbol the Script defines, in Script order.
 *
 * Definitions only. A Label is defined by `A:`, a Variable by an assignment to
 * it, a Macro by `define`; every later mention of any of them is a use, and
 * uses are not Symbols. A name defined twice appears twice — which is what
 * lets a Lint say so (#1028).
 */
export function symbols(tree: Tree, text: string): readonly Symbol[] {
  const found: Symbol[] = [];
  const cursor = tree.cursor();
  do {
    const definition = DEFINITIONS[cursor.name];
    if (!definition) continue;
    const name = definition.name.reduce<SyntaxNode | null>(
      (found, child) => found ?? cursor.node.getChild(child),
      null,
    );
    if (name) {
      found.push({
        kind: definition.kind,
        name: text.slice(name.from, name.to),
        span: spanOf(name),
      });
    }
  } while (cursor.next());
  return found;
}
