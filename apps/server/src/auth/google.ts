import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env.js';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export function googleAuthUrl(env: Env): { url: string; state: string } {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: env.GOOGLE_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state };
}

export async function exchangeCodeForProfile(code: string, env: Env): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: env.GOOGLE_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);

  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) throw new Error('Google token exchange returned no id_token');

  const { payload } = await jwtVerify(token.id_token, createRemoteJWKSet(new URL(GOOGLE_CERTS)), {
    issuer: GOOGLE_ISSUER,
    audience: env.GOOGLE_CLIENT_ID,
  });

  return {
    sub: payload.sub as string,
    email: (payload.email as string) ?? '',
    name: (payload.name as string) ?? ((payload.email as string) ?? '').split('@')[0],
    avatarUrl: (payload.picture as string) ?? null,
  };
}
