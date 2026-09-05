import { Hono } from 'hono';
import type { Role } from '@esbuddy/sdk';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import { getUser } from '../auth/service.js';
import type { AppVariables } from '../../context.js';
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
  const workspace = await service.createWorkspace(c.var.db, body.name, c.var.userId!);
  return c.json(workspace, 201);
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
invitationRoutes.post('/:token/accept', async (c) => {
  const workspace = await service.acceptInvitation(c.var.db, c.req.param('token'), c.var.userId!);
  return workspace ? c.json(workspace) : c.json({ error: 'invalid or revoked invitation' }, 404);
});
