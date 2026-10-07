/**
 * A Script, shared as a link (#1032).
 *
 * The Script travels in the URL's fragment, which never leaves the browser —
 * no server ever sees it, or could (ADR 0003). It is deflated, then written in
 * base64url, the one alphabet a fragment takes without escaping:
 *
 *     https://…/pikchard/#s=1.<base64url(deflate(utf-8(Script)))>
 *
 * The `1.` is the format's version. A later format takes `2.`, and a page that
 * meets a version it does not know says the link is broken rather than
 * guessing at it.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

const KEY = "s=";
const VERSION = "1.";

/**
 * How long a link can be before some of the places it gets pasted start to cut
 * it: chat apps, mail clients, and older browsers' address bars. Not a limit on
 * what Pikchard opens — only the point past which Copy Link says so.
 */
export const LONG_LINK = 8000;

/** The link that opens `script` in the web app at `base`. */
export function shareLink(base: string, script: string): string {
  const packed = deflateSync(strToU8(script), { level: 9 });
  return `${base.split("#")[0]}#${KEY}${VERSION}${toBase64Url(packed)}`;
}

export function isLong(link: string): boolean {
  return link.length > LONG_LINK;
}

/** What a page's fragment carries: nothing, a Script, or a link that is broken. */
export type SharedScript =
  | { readonly kind: "script"; readonly script: string }
  | { readonly kind: "broken" };

export function scriptFromHash(hash: string): SharedScript | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!fragment.startsWith(KEY)) return null;
  const payload = fragment.slice(KEY.length);
  if (!payload.startsWith(VERSION)) return { kind: "broken" };
  try {
    return {
      kind: "script",
      script: strFromU8(inflateSync(fromBase64Url(payload.slice(VERSION.length)))),
    };
  } catch {
    return { kind: "broken" };
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
