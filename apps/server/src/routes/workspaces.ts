import { Hono } from 'hono';
import type { Role } from '@esbuddy/sdk';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import type { AppVariables } from '../context.js';
import {
  acceptInvitation,
  createInvitation,
  createWorkspace,
  getMemberRole,
  listMembers,
  listWorkspacesForUser,
} from '../repo.js';

export const workspaceRoutes = new Hono<{ Variables: AppVariables }>();

workspaceRoutes.use('*', authMiddleware, requireAuth);

workspaceRoutes.get('/', async (c) => {
  const workspaces = await listWorkspacesForUser(c.var.db, c.var.userId!);
  return c.json(workspaces);
});

workspaceRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string }>();
  const workspace = await createWorkspace(c.var.db, body.name, c.var.userId!);
  return c.json(workspace, 201);
});

workspaceRoutes.get('/:id/members', async (c) => {
  const members = await listMembers(c.var.db, c.req.param('id'));
  return c.json(members);
});

workspaceRoutes.post('/:id/invitations', async (c) => {
  const workspaceId = c.req.param('id');
  const role = await getMemberRole(c.var.db, workspaceId, c.var.userId!);
  if (role !== 'owner') return c.json({ error: 'only owners can invite' }, 403);

  const body = await c.req.json<{ role: Role }>();
  const invitation = await createInvitation(c.var.db, workspaceId, body.role ?? 'editor', c.var.userId!);
  return c.json(invitation, 201);
});

// Join a workspace via a share link (ADR-0001.5).
export const invitationRoutes = new Hono<{ Variables: AppVariables }>();
invitationRoutes.use('*', authMiddleware, requireAuth);
invitationRoutes.post('/:token/accept', async (c) => {
  const workspace = await acceptInvitation(c.var.db, c.req.param('token'), c.var.userId!);
  return workspace ? c.json(workspace) : c.json({ error: 'invalid or revoked invitation' }, 404);
});
