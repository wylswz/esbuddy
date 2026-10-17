import { Hono } from 'hono';
import type { Role } from '@esbuddy/sdk';
import { authMiddleware, requireAuth, requireSession } from '../auth/middleware.js';
import { getUser } from '../auth/service.js';
import { workspaceAccess } from '../access/service.js';
import type { AppVariables } from '../../context.js';
import { LimitError, parseLimits } from '../../limits.js';
import * as service from './service.js';
import { workspaceTokenRoutes } from './tokens.api.js';

export const workspaceRoutes = new Hono<{ Variables: AppVariables }>();

workspaceRoutes.use('*', authMiddleware, requireAuth);

workspaceRoutes.get('/', async (c) => {
  if (c.var.workspaceToken) {
    const workspace = await service.getWorkspace(c.var.db, c.var.workspaceToken.workspaceId);
    return c.json(workspace ? [workspace] : []);
  }
  const userId = c.var.userId!;
  const user = await getUser(c.var.db, userId);
  const workspaces = await service.ensureUserHasWorkspace(c.var.db, userId, user?.name);
  return c.json(workspaces);
});

workspaceRoutes.post('/', requireSession, async (c) => {
  const body = await c.req.json<{ name: string }>();
  try {
    const workspace = await service.createWorkspace(c.var.db, body.name, c.var.userId!, parseLimits(c.var.env));
    return c.json(workspace, 201);
  } catch (err) {
    if (err instanceof LimitError) return c.json({ error: err.message }, 403);
    throw err;
  }
});

workspaceRoutes.delete('/:id', requireSession, async (c) => {
  const deleted = await service.deleteWorkspace(c.var.db, c.req.param('id'), c.var.userId!);
  return deleted ? c.body(null, 204) : c.json({ error: 'not found or not owner' }, 404);
});

workspaceRoutes.get('/:id/members', async (c) => {
  const workspaceId = c.req.param('id');
  if (!(await workspaceAccess(c.var.db, workspaceId, c.var.workspaceToken ?? c.var.userId!))) return c.json({ error: 'not found' }, 404);
  return c.json(await service.listMembers(c.var.db, workspaceId));
});

workspaceRoutes.post('/:id/invitations', requireSession, async (c) => {
  const workspaceId = c.req.param('id');
  const body = await c.req.json<{ role?: Role }>();
  const role = body.role ?? 'editor';
  // Ownership is never handed out through a link.
  if (role !== 'editor' && role !== 'viewer') return c.json({ error: 'role must be editor or viewer' }, 400);
  const invitation = await service.inviteToWorkspace(c.var.db, workspaceId, c.var.userId!, role);
  if (!invitation) return c.json({ error: 'only owners can invite' }, 403);
  return c.json(invitation, 201);
});

workspaceRoutes.route('/:id/tokens', workspaceTokenRoutes);

// Join a workspace via a share link (ADR-0001.5).
export const invitationRoutes = new Hono<{ Variables: AppVariables }>();
invitationRoutes.use('*', authMiddleware, requireSession);
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
