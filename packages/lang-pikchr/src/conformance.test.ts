import { corpusScripts } from "@pikchard/pikchr-corpus";
import { describe, expect, it } from "vitest";
import { EXPECTED_REJECTIONS, KNOWN_GAPS } from "./corpus-expectations.js";
import { errorSpans, parseScript } from "./tree.js";

// What upstream accepts, we accept. The corpus is a *conformance* corpus, so
// breadth is the point: every Script the pinned check-in ships is parsed here,
// and each one lands in exactly one of three buckets — clean, expected
// rejection, or recorded gap.

const scripts = corpusScripts();
const clean = scripts.filter(({ name }) => !(name in EXPECTED_REJECTIONS) && !(name in KNOWN_GAPS));

describe("the corpus", () => {
  it("is all of it — a corpus that silently shrank would pass every test below", () => {
    // The corpus can only change when the pin moves, and a bump that drops
    // Scripts has to be noticed here as well as in `pikchr-corpus` itself.
    // 261, not the 270 fences upstream ships: nine of them are duplicates,
    // which `pikchr-corpus` folds together by content hash.
    expect(scripts).toHaveLength(261);
  });

  it("puts every Script in exactly one bucket", () => {
    const names = new Set(scripts.map(({ name }) => name));
    const listed = [...Object.keys(EXPECTED_REJECTIONS), ...Object.keys(KNOWN_GAPS)];

    // A name in a list that is no longer in the corpus is as much a drift as a
    // Script that stopped parsing.
    for (const name of listed) expect(names).toContain(name);
    expect(new Set(listed).size).toBe(listed.length);
    expect(clean.length + listed.length).toBe(scripts.length);
  });

  it("gives a reason for every Script that is not clean", () => {
    for (const reason of [...Object.values(EXPECTED_REJECTIONS), ...Object.values(KNOWN_GAPS)]) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});

describe.each(clean)("$name", ({ text }) => {
  it("parses with no error nodes", () => {
    expect(errorSpans(parseScript(text))).toEqual([]);
  });
});

// Both lists are asserted the same way — the Script must still fail — but
// they mean opposite things, so each keeps its own sentence. A rejection that
// starts parsing means the grammar got too permissive; a gap that starts
// parsing means the gap is closed and the entry should go.
const notClean: readonly [name: string, expectation: string][] = [
  ...Object.keys(EXPECTED_REJECTIONS).map((name): [string, string] => [
    name,
    "is rejected, as invalid Pikchr should be",
  ]),
  ...Object.keys(KNOWN_GAPS).map((name): [string, string] => [
    name,
    "is still the recorded gap — fix it and this list loses an entry",
  ]),
];

describe.each(notClean)("%s", (name, expectation) => {
  it(expectation, () => {
    const script = scripts.find((s) => s.name === name);

    expect(script).toBeDefined();
    expect(errorSpans(parseScript(script?.text ?? ""))).not.toEqual([]);
  });
});
