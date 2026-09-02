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
  DEV_MODE?: string; // 'true' | 'false' — enables dev-only endpoints (dev-login)
  PORT?: string;
}

/** Dev-only features (e.g. /api/auth/dev-login) are gated behind DEV_MODE. */
export function isDevMode(env: Env): boolean {
  return env.DEV_MODE === 'true' || env.DEV_MODE === '1';
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
  const devMode =
    process.env.DEV_MODE ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true');
  const env: Env = {
    DB_KIND: process.env.DB_KIND,
    DB_PATH: process.env.DB_PATH,
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    FRONTEND_URL: process.env.FRONTEND_URL,
    WEB_DIST_PATH: process.env.WEB_DIST_PATH,
    DEV_MODE: devMode,
    PORT: process.env.PORT,
  };
  if (process.env.NODE_ENV === 'production' && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return env;
}
