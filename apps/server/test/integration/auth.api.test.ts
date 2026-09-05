import type { User } from '@esbuddy/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, testEnv, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

describe('auth API', () => {
  let app: TestApp;
  beforeEach(() => {
    app = buildAppWithDb(createTestDb());
  });

  it('dev-login returns a token and user', async () => {
    const { token, user } = await devLogin(app);
    expect(token).toBeTruthy();
    expect(user.email).toBe('alice@example.com');
  });

  it('/auth/me returns the user when authorized and null otherwise', async () => {
    const { token, user } = await devLogin(app);
    const authed = await app.request('/api/auth/me', { headers: authHeaders(token) });
    expect((await authed.json() as User).id).toBe(user.id);

    const anon = await app.request('/api/auth/me');
    expect(await anon.json()).toBeNull();
  });

  it('dev-login is disabled when DEV_MODE is off', async () => {
    const prod = buildAppWithDb(createTestDb(), testEnv({ DEV_MODE: 'false' }));
    const res = await prod.request('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
