import { describe, expect, it } from "vitest";
import { githubReleases, isNewer } from "./releases.js";

const REPOSITORY = "https://github.com/Reonarudo/pikchard";

/** A `fetch` that answers the latest-release endpoint, and records what it was asked. */
function answering(status: number, body: unknown) {
  const asked: string[] = [];
  const fetcher = async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(JSON.stringify(body), { status });
  };
  return { asked, fetcher: fetcher as typeof fetch };
}

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `${REPOSITORY}/releases/tag/${tag}`,
});

describe("a version being newer", () => {
  it("compares numerically, part by part", () => {
    expect(isNewer("v0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("v0.10.0", "0.9.0")).toBe(true);
    expect(isNewer("v1.0.0", "0.99.99")).toBe(true);
  });

  it("is not the same version, nor an older one", () => {
    expect(isNewer("v0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("v0.1.0", "0.2.0")).toBe(false);
  });

  it("is never a tag that is not a version", () => {
    expect(isNewer("nightly", "0.1.0")).toBe(false);
  });
});

describe("asking GitHub for the latest release", () => {
  it("asks the repository's latest-release endpoint", async () => {
    const { asked, fetcher } = answering(200, release("v0.1.0"));

    await githubReleases(REPOSITORY, "0.1.0", fetcher).check();

    expect(asked).toEqual(["https://api.github.com/repos/Reonarudo/pikchard/releases/latest"]);
  });

  it("offers a newer release, with the version and where to get it", async () => {
    const { fetcher } = answering(200, release("v0.2.0"));

    expect(await githubReleases(REPOSITORY, "0.1.0", fetcher).check()).toEqual({
      kind: "available",
      version: "0.2.0",
      url: `${REPOSITORY}/releases/tag/v0.2.0`,
    });
  });

  it("says this is the latest when it is", async () => {
    const { fetcher } = answering(200, release("v0.1.0"));

    expect(await githubReleases(REPOSITORY, "0.1.0", fetcher).check()).toEqual({
      kind: "current",
    });
  });

  it("says it could not check when GitHub says no, or nothing", async () => {
    // 404 is a repository with no releases yet; 403 is the rate limit.
    for (const status of [403, 404, 500]) {
      const { fetcher } = answering(status, {});
      expect(await githubReleases(REPOSITORY, "0.1.0", fetcher).check()).toEqual({
        kind: "failed",
      });
    }

    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await githubReleases(REPOSITORY, "0.1.0", offline).check()).toEqual({
      kind: "failed",
    });
  });

  it("says it could not check when the answer is not a release", async () => {
    const { fetcher } = answering(200, { message: "odd" });

    expect(await githubReleases(REPOSITORY, "0.1.0", fetcher).check()).toEqual({
      kind: "failed",
    });
  });
});
