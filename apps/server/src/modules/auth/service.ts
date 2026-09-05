import type { User } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import type { Env } from '../../env.js';
import { createPersonalWorkspace } from '../workspace/service.js';
import { exchangeCodeForProfile } from './google.js';
import { signToken } from './jwt.js';
import * as repo from './repo.js';

export function getUser(db: Db, id: string): Promise<User | null> {
  return repo.getUserById(db, id);
}

/**
 * Resolve a Google identity to a user, creating the account (and a personal
 * workspace) on first sign-in. Idempotent for returning users.
 */
export async function registerGoogleUser(
  db: Db,
  input: { googleSub: string; email: string; name: string; avatarUrl?: string | null },
): Promise<User> {
  const existing = await repo.getUserByGoogleSub(db, input.googleSub);
  if (existing) return existing;

  const user = await repo.insertUser(db, input);
  // Every new user gets a personal workspace so they always have a place to work.
  await createPersonalWorkspace(db, user.name, user.id);
  return user;
}

/**
 * Complete the Google OAuth callback: exchange the auth code for a profile,
 * upsert the user, and issue a session token.
 */
export async function completeGoogleLogin(db: Db, env: Env, code: string): Promise<{ token: string; user: User }> {
  const profile = await exchangeCodeForProfile(code, env);
  const user = await registerGoogleUser(db, {
    googleSub: profile.sub,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  });
  const token = await signToken(user.id, env);
  return { token, user };
}

/** Dev-only login: mint a token for a local user without Google. */
export async function devLogin(db: Db, env: Env, input: { email?: string; name?: string }): Promise<{ token: string; user: User }> {
  const email = input.email ?? 'dev@esbuddy.local';
  const name = input.name ?? 'Dev User';
  const user = await registerGoogleUser(db, { googleSub: `dev:${email}`, email, name });
  const token = await signToken(user.id, env);
  return { token, user };
}
