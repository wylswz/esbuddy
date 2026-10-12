/**
 * Published-version permalinks. A version's id is a 40-char hex signature
 * (like a git commit id); its public, read-only permalink is `<origin>/v/<id>`.
 * Only meaningful in remote mode, where the SPA is served from the domain root
 * and the server falls back to index.html for client-side routes.
 */
const PERMALINK = /^\/v\/([0-9a-f]{40})\/?$/;

export function versionPermalink(id: string): string {
  return `${window.location.origin}/v/${id}`;
}

export function parseVersionPermalink(pathname: string): string | null {
  return PERMALINK.exec(pathname)?.[1] ?? null;
}

/** Abbreviated signature for display, like `git log --oneline`. */
export function shortSig(id: string): string {
  return id.slice(0, 7);
}
