import { drizzle } from 'drizzle-orm/d1';
import type { Db } from './types.js';
import { schema } from './schema.js';

// Cloudflare-only DB factory. Kept in its own module so it (and the Workers
// bundle) never pulls in `better-sqlite3` / `node:*` from `./index.ts`. Only the
// `Db` *type* is imported from there, which is erased at build time.

/**
 * D1 (Cloudflare Workers) DB factory. Migrations are applied out-of-band with
 * `wrangler d1 migrations apply` — there is no fs-based migrator at runtime.
 */
export function createD1Db(d1: D1Database): Db {
  return drizzle(d1, { schema }) as unknown as Db;
}
