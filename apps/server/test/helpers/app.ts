import type { User } from '@esbuddy/sdk';
import { buildApp } from '../../src/app.js';
import type { Db } from '../../src/db/types.js';
import type { Env } from '../../src/env.js';

export type TestApp = ReturnType<typeof buildApp>;

// Platform-neutral test helpers (no Node- or Workers-specific imports) so both
// the Node and Cloudflare integration suites can share them.

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { DB_KIND: 'sqlite', DEV_MODE: 'true', JWT_SECRET: 'test-secret', ...overrides };
}

export function buildAppWithDb(db: Db, env: Env = testEnv()): TestApp {
  return buildApp({ db, env });
}

export function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

/** Mint a session by hitting the dev-login endpoint (DEV_MODE must be on). */
export async function devLogin(
  app: TestApp,
  opts: { email?: string; name?: string } = {},
): Promise<{ token: string; user: User }> {
  const res = await app.request('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: opts.email ?? 'alice@example.com', name: opts.name ?? 'Alice' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  return (await res.json()) as { token: string; user: User };
}
