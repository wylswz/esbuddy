import { Hono } from 'hono';
import type { CanvasOwner, CanvasSnapshot } from '@esbuddy/sdk';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import type { AppVariables } from '../context.js';
import { createCanvas, deleteCanvas, getCanvas, listCanvases, listEvents, saveCanvas } from '../repo.js';

export const canvasRoutes = new Hono<{ Variables: AppVariables }>();

canvasRoutes.use('*', authMiddleware, requireAuth);

canvasRoutes.get('/', async (c) => {
  const userId = c.var.userId!;
  const workspaceId = c.req.query('workspace');
  const metas = await listCanvases(c.var.db, userId, workspaceId);
  return c.json(metas);
});

canvasRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string; owner?: CanvasOwner }>();
  const userId = c.var.userId!;
  const owner: CanvasOwner = body.owner ?? { type: 'user', userId };
  const meta = await createCanvas(c.var.db, body.name, owner, userId);
  return c.json(meta, 201);
});

canvasRoutes.get('/:id', async (c) => {
  const record = await getCanvas(c.var.db, c.req.param('id'));
  return record ? c.json(record) : c.json(null, 404);
});

canvasRoutes.put('/:id', async (c) => {
  const body = await c.req.json<{ snapshot: CanvasSnapshot; name?: string }>();
  const meta = await saveCanvas(c.var.db, c.req.param('id'), body.snapshot, body.name, c.var.userId);
  return meta ? c.json(meta) : c.json({ error: 'not found' }, 404);
});

canvasRoutes.delete('/:id', async (c) => {
  await deleteCanvas(c.var.db, c.req.param('id'));
  return c.body(null, 204);
});

// Append-only event log (reserved for future realtime sync, ADR-0001.7).
canvasRoutes.get('/:id/events', async (c) => {
  const after = c.req.query('after');
  const events = await listEvents(c.var.db, c.req.param('id'), after ? Number(after) : undefined);
  return c.json(events);
});
