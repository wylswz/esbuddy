import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../env.js';

function secret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET ?? 'esbuddy-dev-secret');
}

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
