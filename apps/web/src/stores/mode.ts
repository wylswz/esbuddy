/**
 * Deployment mode, fixed at build time via `VITE_STORE_MODE` (ADR-0001.1):
 *  - `local`  (default): stateless GitHub Pages build — localStorage + IndexedDB
 *  - `remote`: talks to the Hono backend (Node or Cloudflare) — REST + WebSocket
 */
export function isRemoteMode(): boolean {
  return (import.meta.env.VITE_STORE_MODE ?? 'local') === 'remote';
}
