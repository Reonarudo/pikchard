import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parser } from "../parser/pikchr.js";
import { generate, PARSER_FILE, TERMS_FILE } from "../scripts/grammar.mjs";

// The generated parser is committed, so that the tests and the app can import
// it without a build step having run first. What keeps a committed artifact
// honest is a test that rebuilds it — the same bargain `verify-wasm.sh` makes
// on the render side.

describe("the committed parser", () => {
  it("is what the grammar generates today", () => {
    const fresh = generate();

    expect(readFileSync(PARSER_FILE, "utf8")).toBe(fresh.parser);
    expect(readFileSync(TERMS_FILE, "utf8")).toBe(fresh.terms);
  });

  it("names its top node Script, because a Document holds many of them", () => {
    expect(parser.topNode.name).toBe("Script");
  });

  it("ports pikchr.y closely enough to still be recognisable as it", () => {
    const named = parser.nodeSet.types.filter((type) => !type.isAnonymous).map((type) => type.name);

    for (const production of [
      "Lvalue",
      "Rvalue",
      "Basetype",
      "AttributeList",
      "Position",
      "Place",
      "Place2",
      "Object",
      "Objectname",
      "Nth",
      "Relexpr",
      "Textposition",
    ]) {
      expect(named).toContain(production);
    }
  });
});
