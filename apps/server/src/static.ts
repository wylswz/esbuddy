import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import type { MiddlewareHandler } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Node-only static file serving for the built SPA (ADR-0001.9).
 * On Cloudflare Workers this is replaced by the Assets binding instead of fs.
 */
export function staticMiddleware(root: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!root) return next();
    const { pathname } = new URL(c.req.url);
    if (pathname.startsWith('/api/') || pathname === '/health') return next();
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();

    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let file = resolve(root, rel);
    if (file !== root && !file.startsWith(root + sep)) {
      return new Response('forbidden', { status: 403 });
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = resolve(root, 'index.html'); // SPA fallback
    }
    if (!existsSync(file)) return new Response('not found', { status: 404 });

    const body = readFileSync(file);
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    return new Response(body, { headers: { 'content-type': type } });
  };
}
