import { describe, expect, it } from 'vitest';
import { signState, signToken, verifyState, verifyToken } from '../../src/modules/auth/jwt.js';
import { testEnv } from '../helpers/app.js';

const env = testEnv();

describe('auth/jwt', () => {
  it('round-trips a session token', async () => {
    const token = await signToken('user-1', env);
    expect(await verifyToken(token, env)).toBe('user-1');
  });

  it('rejects a garbage token', async () => {
    expect(await verifyToken('not-a-jwt', env)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken('user-1', testEnv({ JWT_SECRET: 'a-different-secret' }));
    expect(await verifyToken(token, env)).toBeNull();
  });

  it('validates OAuth state nonces', async () => {
    const state = await signState(env);
    expect(await verifyState(state, env)).toBe(true);
    expect(await verifyState('bogus', env)).toBe(false);
  });
});
