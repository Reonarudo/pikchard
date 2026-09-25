/**
 * What Pikchard calls itself (#1023).
 *
 * The version comes from `package.json` through Vite's `define`, so About and the
 * package cannot disagree — a hand-kept copy would be wrong at the first release.
 * The repository URL is here rather than in `copy.ts` because it is a fact about
 * the build, not a string the voice rules apply to; About's *label* for it is copy.
 */

/**
 * Replaced at build time; `0.0.0-dev` only if the define is missing — which is
 * any code that imports this outside Vite, Playwright's own Node process among
 * them. `typeof` rather than `??`: an undeclared identifier is a `ReferenceError`,
 * not `undefined`, so `??` would never reach its fallback.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "undefined" ? "0.0.0-dev" : __APP_VERSION__;

export const REPOSITORY_URL = "https://github.com/reox/pikchard";
