import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { schema } from './schema.js';

/**
 * Platform-agnostic DB handle (ADR-0001.3). Both drivers — better-sqlite3 (node,
 * `./index.ts`) and D1 (Cloudflare, `./d1.ts`) — expose the SQLite query builder
 * the repository layer uses. `repo.ts` awaits every call, so the async-shaped
 * base type fits both (awaiting a sync value is a no-op). Kept in its own,
 * dependency-free module so both factories and all domain code can reference the
 * type without pulling in any Node- or Workers-specific imports.
 */
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;
