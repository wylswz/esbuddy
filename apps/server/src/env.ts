// Platform-agnostic runtime configuration. This module has NO Node or Workers
// specific imports so it can be bundled for either target. The Node bootstrap
// (`env.node.ts`) and the Workers bootstrap (`worker.ts`) each resolve an `Env`
// from their own platform primitives and hand it to the shared `buildApp`.

export interface Env {
  DB_KIND?: string; // 'sqlite' (default, node) | 'd1' (cloudflare) | 'pg'
  DB_PATH?: string; // sqlite file path (node only)
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  WEB_DIST_PATH?: string; // built SPA assets (node only; Workers use the Assets binding)
  DEV_MODE?: string; // 'true' | 'false' — enables dev-only endpoints (dev-login)
  PORT?: string; // node only
}

/** Dev-only features (e.g. /api/auth/dev-login) are gated behind DEV_MODE. */
export function isDevMode(env: Env): boolean {
  return env.DEV_MODE === 'true' || env.DEV_MODE === '1';
}

// The Node resolver lives in `env.node.ts` and the Cloudflare Workers resolver
// (which references D1/Assets binding types) lives in `env.workers.ts`, keeping
// this module free of any platform-specific globals.
