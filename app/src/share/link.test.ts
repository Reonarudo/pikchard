import { describe, expect, it } from "vitest";
import { isLong, LONG_LINK, scriptFromHash, shareLink } from "./link.js";

const BASE = "https://reonarudo.github.io/pikchard/";

/** The Script a link carries, the way a page opening it would read it. */
const opened = (link: string) => scriptFromHash(new URL(link).hash);

describe("a share link", () => {
  it("carries the Script in the fragment, behind a format version", () => {
    const link = shareLink(BASE, "box\n");

    expect(link.startsWith(`${BASE}#s=1.`)).toBe(true);
  });

  it("gives the Script back byte for byte", () => {
    for (const script of [
      "box\n",
      'A: box "Café ☕ — naïve"\narrow\n',
      "box\r\narrow\r\n",
      "  indented\n\ttab  \n",
      "",
      "no newline at the end",
    ]) {
      expect(opened(shareLink(BASE, script))).toEqual({ kind: "script", script });
    }
  });

  it("uses only characters a URL fragment takes as they are", () => {
    const link = shareLink(BASE, `${"x".repeat(500)}ÿ€\u{1F600}`);

    expect(link.split("#")[1]).toMatch(/^s=1\.[A-Za-z0-9_-]+$/);
  });

  it("compresses, so a long Script makes a short link", () => {
    const script = 'box "Process"\narrow\n'.repeat(200);

    expect(shareLink(BASE, script).length).toBeLessThan(script.length / 5);
  });

  it("is long past the documented limit, and only then", () => {
    expect(isLong("x".repeat(LONG_LINK))).toBe(false);
    expect(isLong("x".repeat(LONG_LINK + 1))).toBe(true);
  });
});

describe("a page's fragment", () => {
  it("is not a share link at all when it carries no Script", () => {
    expect(scriptFromHash("")).toBeNull();
    expect(scriptFromHash("#")).toBeNull();
    expect(scriptFromHash("#section-2")).toBeNull();
  });

  it("is a broken link when its Script cannot be read", () => {
    expect(scriptFromHash("#s=1.not-deflate")).toEqual({ kind: "broken" });
    expect(scriptFromHash("#s=9.whatever")).toEqual({ kind: "broken" });
    expect(scriptFromHash("#s=")).toEqual({ kind: "broken" });
  });
});
