import { Hono } from 'hono';
import type { Role } from '@esbuddy/sdk';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import { getUser } from '../auth/service.js';
import type { AppVariables } from '../../context.js';
import { LimitError, parseLimits } from '../../limits.js';
import * as service from './service.js';

export const workspaceRoutes = new Hono<{ Variables: AppVariables }>();

workspaceRoutes.use('*', authMiddleware, requireAuth);

workspaceRoutes.get('/', async (c) => {
  const userId = c.var.userId!;
  const user = await getUser(c.var.db, userId);
  const workspaces = await service.ensureUserHasWorkspace(c.var.db, userId, user?.name);
  return c.json(workspaces);
});

workspaceRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string }>();
  try {
    const workspace = await service.createWorkspace(c.var.db, body.name, c.var.userId!, parseLimits(c.var.env));
    return c.json(workspace, 201);
  } catch (err) {
    if (err instanceof LimitError) return c.json({ error: err.message }, 403);
    throw err;
  }
});

workspaceRoutes.delete('/:id', async (c) => {
  const deleted = await service.deleteWorkspace(c.var.db, c.req.param('id'), c.var.userId!);
  return deleted ? c.body(null, 204) : c.json({ error: 'not found or not owner' }, 404);
});

workspaceRoutes.get('/:id/members', async (c) => {
  const members = await service.listMembers(c.var.db, c.req.param('id'));
  return c.json(members);
});

workspaceRoutes.post('/:id/invitations', async (c) => {
  const workspaceId = c.req.param('id');
  const body = await c.req.json<{ role: Role }>();
  const invitation = await service.inviteToWorkspace(c.var.db, workspaceId, c.var.userId!, body.role ?? 'editor');
  if (!invitation) return c.json({ error: 'only owners can invite' }, 403);
  return c.json(invitation, 201);
});

// Join a workspace via a share link (ADR-0001.5).
export const invitationRoutes = new Hono<{ Variables: AppVariables }>();
invitationRoutes.use('*', authMiddleware, requireAuth);
// Preview an invitation (workspace name + role) so the recipient can confirm
// before joining. Does not mutate membership.
invitationRoutes.get('/:token', async (c) => {
  const preview = await service.previewInvitation(c.var.db, c.req.param('token'));
  return c.json(preview);
});
invitationRoutes.post('/:token/accept', async (c) => {
  try {
    const workspace = await service.acceptInvitation(c.var.db, c.req.param('token'), c.var.userId!, parseLimits(c.var.env));
    return workspace ? c.json(workspace) : c.json({ error: 'invalid or revoked invitation' }, 404);
  } catch (err) {
    if (err instanceof LimitError) return c.json({ error: err.message }, 403);
    throw err;
  }
});
