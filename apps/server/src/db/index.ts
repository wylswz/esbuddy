import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Env } from '../env.js';
import { schema } from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Polymorphic DB factory (ADR-0001.3). Default is SQLite via `better-sqlite3`
 * for local development. `d1` and `pg` are extension points behind the same
 * repository interface (add a D1 adapter or a pg driver here and return an
 * equivalent drizzle client).
 */
export function createDb(env: Env): Db {
  const kind = env.DB_KIND ?? 'sqlite';
  if (kind !== 'sqlite') {
    throw new Error(`DB_KIND=${kind} is not implemented yet; only 'sqlite' is available locally`);
  }

  const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
  const dbPath = env.DB_PATH ? resolve(env.DB_PATH) : resolve(packageRoot, '.db/esbuddy.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });

  return db;
}
