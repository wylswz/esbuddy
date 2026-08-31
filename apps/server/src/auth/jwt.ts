import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../env.js';

const DEV_SECRET = 'esbuddy-dev-secret';

function secret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET ?? DEV_SECRET);
}

/** Signed session token for an authenticated user. */
export async function signToken(userId: string, env: Env): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret(env));
}

export async function verifyToken(token: string, env: Env): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(env), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Stateless OAuth `state` nonce (CSRF protection, short-lived). */
export async function signState(env: Env): Promise<string> {
  return new SignJWT({ nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret(env));
}

export async function verifyState(state: string, env: Env): Promise<boolean> {
  try {
    await jwtVerify(state, secret(env), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
