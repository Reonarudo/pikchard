import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORPUS_CHECKIN } from "./index.js";

const lock = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../pikchr-wasm/vendor/pikchr.lock.json", import.meta.url)),
    "utf8",
  ),
) as { checkin: string };

describe("the corpus and the pin", () => {
  it("came from the check-in the lock file names", () => {
    // The same guard pikchr-wasm's pin.test.ts puts on the committed WASM,
    // against the same mistake: bumping the lock and forgetting to regenerate
    // what derives from it. Fix by running `npm run extract -w
    // @pikchard/pikchr-corpus`.
    expect(CORPUS_CHECKIN).toBe(lock.checkin);
  });
});
