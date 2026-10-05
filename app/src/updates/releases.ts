/**
 * Check for Updates (#1035).
 *
 * Two answers to one question, because the two Platforms get new versions in
 * two ways. The web build has a service worker that installs a new version
 * and waits (#1025), so checking there means asking it to look now
 * (`offline/updates.ts`). The desktop build has nothing of the kind, so it
 * asks GitHub for the latest published release and offers the download: no
 * auto-update, and no request the user did not ask for.
 */

/** What a check found. */
export type UpdateCheck =
  /** This is the newest version there is. */
  | { readonly kind: "current" }
  /** The web build: a new version is installed and waiting, and its own Toast says so. */
  | { readonly kind: "waiting" }
  /** The desktop build: a newer release, and the page to download it from. */
  | { readonly kind: "available"; readonly version: string; readonly url: string }
  /** No answer — offline, rate-limited, or no release published yet. */
  | { readonly kind: "failed" };

export interface UpdateChecker {
  check(): Promise<UpdateCheck>;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)/;

/** Whether release tag `candidate` is a later version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const theirs = VERSION.exec(candidate);
  const ours = VERSION.exec(current);
  if (!theirs || !ours) return false;
  for (let part = 1; part <= 3; part++) {
    const difference = Number(theirs[part]) - Number(ours[part]);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/**
 * The desktop's checker: GitHub's latest published release — never a draft or
 * a prerelease, which that endpoint leaves out — against this build's version.
 *
 * @param repository The repository's page, `https://github.com/<owner>/<name>`.
 */
export function githubReleases(
  repository: string,
  current: string,
  fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
): UpdateChecker {
  const slug = new URL(repository).pathname.replace(/^\/|\/$/g, "");
  const endpoint = `https://api.github.com/repos/${slug}/releases/latest`;

  return {
    async check() {
      try {
        const response = await fetcher(endpoint, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) return { kind: "failed" };
        const release: unknown = await response.json();
        if (!isRelease(release)) return { kind: "failed" };
        if (!isNewer(release.tag_name, current)) return { kind: "current" };
        return {
          kind: "available",
          version: release.tag_name.replace(/^v/, ""),
          url: release.html_url,
        };
      } catch {
        return { kind: "failed" };
      }
    },
  };
}

function isRelease(value: unknown): value is { tag_name: string; html_url: string } {
  if (typeof value !== "object" || value === null) return false;
  const { tag_name, html_url } = value as Record<string, unknown>;
  return typeof tag_name === "string" && typeof html_url === "string";
}
