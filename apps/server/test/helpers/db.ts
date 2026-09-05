import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { schema } from '../../src/db/schema.js';
import type { Db } from '../../src/db/types.js';

// Node-only helper: a fresh in-memory SQLite DB with the Drizzle migrations
// applied. Mirrors the Node bootstrap's driver (better-sqlite3). Never import
// this from a Cloudflare (workerd) test — use the D1 binding there instead.
export function createTestDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });
  return db as unknown as Db;
}
