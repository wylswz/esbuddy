import type { CanvasMeta } from '@esbuddy/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

describe('canvas API', () => {
  let app: TestApp;
  let token: string;
  beforeEach(async () => {
    app = buildAppWithDb(createTestDb());
    ({ token } = await devLogin(app));
  });

  async function createCanvas(name: string): Promise<CanvasMeta> {
    const res = await app.request('/api/canvases', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as CanvasMeta;
  }

  it('rejects unauthenticated requests', async () => {
    const res = await app.request('/api/canvases');
    expect(res.status).toBe(401);
  });

  it('creates, lists, renames and deletes a canvas', async () => {
    const meta = await createCanvas('Draft');
    expect(meta.name).toBe('Draft');

    const list = (await (await app.request('/api/canvases', { headers: authHeaders(token) })).json()) as CanvasMeta[];
    expect(list.map((c) => c.id)).toContain(meta.id);

    const renamed = await app.request(`/api/canvases/${meta.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Final' }),
    });
    expect((await renamed.json() as CanvasMeta).name).toBe('Final');

    // Content is not writable over REST — it goes through the realtime room.
    const put = await app.request(`/api/canvases/${meta.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ snapshot: { nodes: [], edges: [], viewport: null } }),
    });
    expect(put.status).toBe(404);

    const del = await app.request(`/api/canvases/${meta.id}`, { method: 'DELETE', headers: authHeaders(token) });
    expect(del.status).toBe(204);

    const after = await app.request(`/api/canvases/${meta.id}`, { headers: authHeaders(token) });
    expect(after.status).toBe(404);
  });

  it('rejects an empty rename with 400', async () => {
    const meta = await createCanvas('X');
    const res = await app.request(`/api/canvases/${meta.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: '   ' }),
    });
    expect(res.status).toBe(400);
  });
});
