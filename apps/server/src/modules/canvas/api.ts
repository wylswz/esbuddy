import { Hono } from 'hono';
import type { CanvasOwner } from '@esbuddy/sdk';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import type { AppVariables } from '../../context.js';
import * as service from './service.js';

export const canvasRoutes = new Hono<{ Variables: AppVariables }>();

canvasRoutes.use('*', authMiddleware, requireAuth);

canvasRoutes.get('/', async (c) => {
  const userId = c.var.userId!;
  const workspaceId = c.req.query('workspace');
  const metas = await service.listCanvases(c.var.db, userId, workspaceId);
  return c.json(metas);
});

canvasRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string; owner?: CanvasOwner }>();
  const userId = c.var.userId!;
  const owner: CanvasOwner = body.owner ?? { type: 'user', userId };
  const meta = await service.createCanvas(c.var.db, body.name, owner, userId);
  return c.json(meta, 201);
});

canvasRoutes.get('/:id', async (c) => {
  const record = await service.getCanvas(c.var.db, c.req.param('id'));
  return record ? c.json(record) : c.json(null, 404);
});

// Canvas content is not writable over REST: edits flow through the realtime room
// at /api/rooms/:id (a WebSocket speaking the y-websocket protocol), which is
// wired per platform in `index.node.ts` / `index.worker.ts`.

canvasRoutes.patch('/:id', async (c) => {
  const body = await c.req.json<{ name: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: 'name required' }, 400);
  const meta = await service.renameCanvas(c.var.db, c.req.param('id'), name);
  return meta ? c.json(meta) : c.json({ error: 'not found' }, 404);
});

canvasRoutes.delete('/:id', async (c) => {
  await service.deleteCanvas(c.var.db, c.req.param('id'));
  return c.body(null, 204);
});

// Append-only event log (reserved for future realtime sync, ADR-0001.7).
canvasRoutes.get('/:id/events', async (c) => {
  const after = c.req.query('after');
  const events = await service.listEvents(c.var.db, c.req.param('id'), after ? Number(after) : undefined);
  return c.json(events);
});
