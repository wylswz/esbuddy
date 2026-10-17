import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppVariables } from '../../context.js';
import { requireSession } from '../auth/middleware.js';
import { getMemberRole } from './service.js';
import * as service from './tokens.service.js';

/** Mounted under /workspaces/:id/tokens; the parent authenticates the caller. */
export const workspaceTokenRoutes = new Hono<{ Variables: AppVariables }>();

workspaceTokenRoutes.use('*', requireSession, async (c, next) => {
  const role = await getMemberRole(c.var.db, c.req.param('id') ?? '', c.var.userId!);
  if (!role) return c.json({ error: 'not found' }, 404);
  if (role !== 'owner') return c.json({ error: 'only owners can manage tokens' }, 403);
  c.header('Cache-Control', 'no-store');
  await next();
});

workspaceTokenRoutes.get('/', async (c) => {
  return c.json(await service.listWorkspaceTokens(c.var.db, c.req.param('id')!));
});

workspaceTokenRoutes.post('/', bodyLimit({ maxSize: 4096 }), async (c) => {
  const input: unknown = await c.req.json().catch(() => null);
  try {
    const token = await service.createWorkspaceToken(c.var.db, c.req.param('id')!, c.var.userId!, input);
    return c.json(token, 201);
  } catch (err) {
    if (err instanceof service.TokenInputError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

workspaceTokenRoutes.delete('/:tokenId', async (c) => {
  const revoked = await service.revokeWorkspaceToken(c.var.db, c.req.param('id')!, c.req.param('tokenId'));
  return revoked ? c.body(null, 204) : c.json({ error: 'not found' }, 404);
});
