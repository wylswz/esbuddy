import { Hono } from 'hono';
import { verifyState } from './jwt.js';
import { googleAuthUrl } from './google.js';
import { authMiddleware } from './middleware.js';
import type { AppVariables } from '../../context.js';
import { isDevMode } from '../../env.js';
import * as service from './service.js';

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
    const { token } = await service.completeGoogleLogin(c.var.db, c.var.env, code);
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
  const user = await service.getUser(c.var.db, userId);
  return c.json(user);
});

// Dev-only login: returns a signed token for a local user (no Google required).
authRoutes.post('/dev-login', async (c) => {
  if (!isDevMode(c.var.env)) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ email?: string; name?: string }>().catch(() => ({ email: undefined, name: undefined }));
  const { token, user } = await service.devLogin(c.var.db, c.var.env, body);
  return c.json({ token, user });
});
