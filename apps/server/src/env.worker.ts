/// <reference types="@cloudflare/workers-types" />
import type { Env } from './env.js';

// Cloudflare Workers Env resolver. Isolated from `env.ts` because it references
// Workers binding globals (D1Database / Fetcher); it is excluded from the Node
// tsconfig and only typechecked under tsconfig.worker.json.

/**
 * Cloudflare Workers bindings + vars. `DB`/`ASSETS` are bindings; the rest are
 * plain vars/secrets configured in `wrangler.jsonc` (or via `wrangler secret`).
 */
export interface WorkerBindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  /** One Durable Object per canvas hosting its collaboration room (`room.worker.ts`). */
  CANVAS_ROOM: DurableObjectNamespace;
  DB_KIND?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  DEV_MODE?: string;
}

/** Workers resolver: bindings/vars → Env (no process.env / fs). */
export function envFromBindings(b: WorkerBindings): Env {
  return {
    DB_KIND: b.DB_KIND ?? 'd1',
    JWT_SECRET: b.JWT_SECRET,
    GOOGLE_CLIENT_ID: b.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: b.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: b.GOOGLE_REDIRECT_URI,
    FRONTEND_URL: b.FRONTEND_URL,
    DEV_MODE: b.DEV_MODE ?? 'false',
  };
}
