import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Env } from '../env.js';
import { schema } from './schema.js';
import type { Db } from './types.js';

export type { Db } from './types.js';

// NOTE: this module has Node-only imports (better-sqlite3, node:fs). It must never
// be value-imported from code bundled for Workers. The D1 factory lives in
// `./d1.worker.ts`; the shared `Db` type lives in `./types.ts`.

/**
 * Node/local DB factory. SQLite via `better-sqlite3`, migrations applied on
 * startup. `d1`/`pg` are not created here — D1 uses `createD1Db` (./d1.ts).
 */
export function createDb(env: Env): Db {
  const kind = env.DB_KIND ?? 'sqlite';
  if (kind !== 'sqlite') {
    throw new Error(
      `createDb() only supports 'sqlite' (got DB_KIND=${kind}). On Cloudflare use createD1Db().`,
    );
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

  return db as unknown as Db;
}
