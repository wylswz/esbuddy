import { Hono } from 'hono';
import { signToken, verifyState } from '../auth/jwt.js';
import { exchangeCodeForProfile, googleAuthUrl } from '../auth/google.js';
import { authMiddleware } from '../auth/middleware.js';
import type { AppVariables } from '../context.js';
import { getUserById, upsertGoogleUser } from '../repo.js';

export const authRoutes = new Hono<{ Variables: AppVariables }>();

// Begin Google OAuth (server-side flow).
authRoutes.get('/google', async (c) => {
  const url = await googleAuthUrl(c.var.env);
  return c.redirect(url);
});

// Google OAuth callback: validate state, exchange code, upsert user, sign JWT.
authRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code) return c.json({ error: 'missing code' }, 400);
  if (!state || !(await verifyState(state, c.var.env))) {
    return c.text('Invalid state parameter', 400);
  }

  try {
    const profile = await exchangeCodeForProfile(code, c.var.env);
    const user = await upsertGoogleUser(c.var.db, {
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
    const token = await signToken(user.id, c.var.env);

    const frontend = c.var.env.FRONTEND_URL ?? '/';
    return c.redirect(`${frontend}?token=${token}`);
  } catch (err) {
    return c.json({ error: 'oauth failed', detail: String(err) }, 401);
  }
});

// Current authenticated user.
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json(null);
  const user = await getUserById(c.var.db, userId);
  return c.json(user);
});

// Dev-only login: returns a signed token for a local user (no Google required).
authRoutes.post('/dev-login', async (c) => {
  const body = await c.req.json<{ email?: string; name?: string }>().catch(() => ({ email: undefined, name: undefined }));
  const email = body.email ?? 'dev@esbuddy.local';
  const name = body.name ?? 'Dev User';
  const user = await upsertGoogleUser(c.var.db, { googleSub: `dev:${email}`, email, name });
  const token = await signToken(user.id, c.var.env);
  return c.json({ token, user });
});
