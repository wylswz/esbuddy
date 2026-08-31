import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Env {
  DB_KIND?: string; // 'sqlite' (default) | 'd1' | 'pg'
  DB_PATH?: string; // sqlite file path (node), or d1/pg connection config
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  WEB_DIST_PATH?: string; // built SPA assets (defaults to apps/web/dist)
  PORT?: string;
}

/** Node-only: load apps/server/.env if present (no-op on Workers). */
function loadDotEnv(): void {
  if (typeof process === 'undefined' || typeof process.loadEnvFile !== 'function') return;
  try {
    const envPath = fileURLToPath(new URL('../.env', import.meta.url));
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  } catch {
    // ignore missing/unreadable .env
  }
}

/** Node bootstrap resolves Env from process.env (Workers maps bindings instead). */
export function getEnv(): Env {
  loadDotEnv();
  return {
    DB_KIND: process.env.DB_KIND,
    DB_PATH: process.env.DB_PATH,
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    FRONTEND_URL: process.env.FRONTEND_URL,
    WEB_DIST_PATH: process.env.WEB_DIST_PATH,
    PORT: process.env.PORT,
  };
}
