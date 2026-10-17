import type {
  CanvasMeta,
  CanvasSnapshot,
  CanvasVersion,
  CanvasVersionMeta,
  PublishedCanvasVersion,
  Workspace,
} from '@esbuddy/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

const SNAPSHOT: CanvasSnapshot = {
  nodes: [{ id: 'n1', type: 'event', position: { x: 1, y: 2 }, data: { label: 'Order Placed' } }],
  edges: [],
  viewport: null,
};

describe('canvas versions API', () => {
  let app: TestApp;
  let token: string;
  let canvas: CanvasMeta;

  beforeEach(async () => {
    app = buildAppWithDb(createTestDb());
    ({ token } = await devLogin(app));
    const res = await app.request('/api/canvases', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Ordering' }),
    });
    canvas = (await res.json()) as CanvasMeta;
  });

  function publish(body: unknown, canvasId = canvas.id) {
    return app.request(`/api/canvases/${canvasId}/versions`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  }

  async function publishOk(body: Record<string, unknown> = {}, canvasId = canvas.id): Promise<CanvasVersionMeta> {
    const res = await publish({ snapshot: SNAPSHOT, ...body }, canvasId);
    expect(res.status).toBe(201);
    return (await res.json()) as CanvasVersionMeta;
  }

  function patch(versionId: string, body: unknown) {
    return app.request(`/api/canvases/${canvas.id}/versions/${versionId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  }

  async function listVersions(): Promise<CanvasVersionMeta[]> {
    const res = await app.request(`/api/canvases/${canvas.id}/versions`, { headers: authHeaders(token) });
    return (await res.json()) as CanvasVersionMeta[];
  }

  it('publishes a private version by default: no permalink until public access is on', async () => {
    const meta = await publishOk({ description: '  First cut  ' });
    expect(meta.id).toMatch(/^[0-9a-f]{40}$/);
    expect(meta).toMatchObject({ canvasId: canvas.id, canvasName: 'Ordering', description: 'First cut', isPublic: false });
    expect((await app.request(`/api/versions/${meta.id}`)).status).toBe(404);

    // Members can still read it (e.g. to restore) through the authed route.
    const full = await app.request(`/api/canvases/${canvas.id}/versions/${meta.id}`, { headers: authHeaders(token) });
    expect(((await full.json()) as CanvasVersion).snapshot.nodes[0].data.label).toBe('Order Placed');
  });

  it('serves a public version without auth and never leaks the canvas id', async () => {
    const meta = await publishOk({ isPublic: true });
    expect(meta.isPublic).toBe(true);
    const pub = await app.request(`/api/versions/${meta.id}`);
    expect(pub.status).toBe(200);
    const version = (await pub.json()) as PublishedCanvasVersion & { canvasId?: string; isPublic?: boolean };
    expect(version.snapshot.nodes[0].data.label).toBe('Order Placed');
    expect(version.canvasName).toBe('Ordering');
    expect(version.canvasId).toBeUndefined();
  });

  it('keeps the board structure (swimlanes, milestones) in the published snapshot', async () => {
    const structure = { lanes: [{ id: 'l1', label: 'Customer', y: 0, height: 240 }], milestones: [{ id: 'm1', label: 'Day 1', x: 400 }] };
    const meta = await publishOk({ snapshot: { ...SNAPSHOT, structure }, isPublic: true });
    const version = (await (await app.request(`/api/versions/${meta.id}`)).json()) as PublishedCanvasVersion;
    expect(version.snapshot.structure).toEqual(structure);
  });

  it('toggles public access on and off', async () => {
    const meta = await publishOk();
    const on = await patch(meta.id, { isPublic: true });
    expect(((await on.json()) as CanvasVersionMeta).isPublic).toBe(true);
    expect((await app.request(`/api/versions/${meta.id}`)).status).toBe(200);

    const off = await patch(meta.id, { isPublic: false });
    expect(((await off.json()) as CanvasVersionMeta).isPublic).toBe(false);
    expect((await app.request(`/api/versions/${meta.id}`)).status).toBe(404);
  });

  it('keeps published content frozen when the canvas is renamed', async () => {
    const meta = await publishOk({ isPublic: true });
    await app.request(`/api/canvases/${canvas.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Renamed' }),
    });
    const version = (await (await app.request(`/api/versions/${meta.id}`)).json()) as PublishedCanvasVersion;
    expect(version.canvasName).toBe('Ordering');
  });

  it('lists versions newest first, edits descriptions and deletes', async () => {
    const a = await publishOk({ description: 'a', isPublic: true });
    await new Promise((r) => setTimeout(r, 5));
    const b = await publishOk({ description: 'b' });
    expect(a.id).not.toBe(b.id);
    expect((await listVersions()).map((v) => v.id)).toEqual([b.id, a.id]);

    const patched = (await (await patch(a.id, { description: 'edited' })).json()) as CanvasVersionMeta;
    expect(patched).toMatchObject({ description: 'edited', isPublic: true });

    const del = await app.request(`/api/canvases/${canvas.id}/versions/${a.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    expect(del.status).toBe(204);
    expect((await listVersions()).map((v) => v.id)).toEqual([b.id]);
    expect((await app.request(`/api/versions/${a.id}`)).status).toBe(404);
  });

  it('validates input and existence', async () => {
    expect((await publish({ description: 'x' })).status).toBe(400);
    expect((await publish({ description: 42, snapshot: SNAPSHOT })).status).toBe(400);
    expect((await publish({ isPublic: 'yes', snapshot: SNAPSHOT })).status).toBe(400);
    expect((await publish({ description: 'x'.repeat(2001), snapshot: SNAPSHOT })).status).toBe(400);
    expect((await publish({ snapshot: SNAPSHOT }, 'missing-canvas')).status).toBe(404);

    const huge = { ...SNAPSHOT, nodes: [{ ...SNAPSHOT.nodes[0], data: { label: 'x'.repeat(1_000_001) } }] };
    expect((await publish({ snapshot: huge })).status).toBe(413);

    const meta = await publishOk();
    expect((await patch(meta.id, {})).status).toBe(400);
    expect((await patch(meta.id, { isPublic: 1 })).status).toBe(400);
    expect((await patch('0'.repeat(40), { description: 'nope' })).status).toBe(404);
    expect((await app.request('/api/versions/not-a-signature')).status).toBe(404);
  });

  it('requires auth for management routes', async () => {
    expect((await app.request(`/api/canvases/${canvas.id}/versions`)).status).toBe(401);
    const res = await app.request(`/api/canvases/${canvas.id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot: SNAPSHOT }),
    });
    expect(res.status).toBe(401);
  });

  it('removes versions when their canvas or workspace is deleted', async () => {
    const v1 = await publishOk({ isPublic: true });
    await app.request(`/api/canvases/${canvas.id}`, { method: 'DELETE', headers: authHeaders(token) });
    expect((await app.request(`/api/versions/${v1.id}`)).status).toBe(404);

    const ws = (await (
      await app.request('/api/workspaces', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Team' }),
      })
    ).json()) as Workspace;
    const wsCanvas = (await (
      await app.request('/api/canvases', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Shared', owner: { type: 'workspace', workspaceId: ws.id } }),
      })
    ).json()) as CanvasMeta;
    const v2 = await publishOk({ isPublic: true }, wsCanvas.id);
    await app.request(`/api/workspaces/${ws.id}`, { method: 'DELETE', headers: authHeaders(token) });
    expect((await app.request(`/api/versions/${v2.id}`)).status).toBe(404);
  });
});
