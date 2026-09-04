import type { MiddlewareHandler } from 'hono';
import type { AppVariables } from './context.js';

/**
 * Cloudflare Workers SPA serving via the Assets binding — the Workers analogue of
 * `static.ts` (which uses `node:fs`). Non-API GET/HEAD requests are handed to the
 * Assets binding; SPA fallback to `index.html` is handled by the binding when
 * `assets.not_found_handling = "single-page-application"` is set in wrangler.jsonc.
 */
export function assetsMiddleware(assets: Fetcher): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const { pathname } = new URL(c.req.url);
    if (pathname.startsWith('/api/') || pathname === '/health') return next();
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    return assets.fetch(c.req.raw);
  };
}
