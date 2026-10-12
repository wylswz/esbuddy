import type { CanvasMeta, CanvasVersionMeta, PublishedCanvasVersion, Workspace } from '@esbuddy/sdk';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createD1Db } from '../../src/db/d1.worker.js';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from '../helpers/app.js';

// Same app + flows as the local integration suite, but running inside
// Miniflare/workerd against a real D1 binding — proving the platform-agnostic
// code behaves identically on Cloudflare.
function cfApp(): TestApp {
  return buildAppWithDb(createD1Db(env.DB));
}

describe('Cloudflare (D1) integration', () => {
  it('runs the auth + canvas lifecycle on D1', async () => {
    const app = cfApp();
    const { token } = await devLogin(app);

    const created = await app.request('/api/canvases', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'CF Canvas' }),
    });
    expect(created.status).toBe(201);
    const meta = (await created.json()) as CanvasMeta;

    const renamed = await app.request(`/api/canvases/${meta.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Renamed on CF' }),
    });
    expect((await renamed.json() as CanvasMeta).name).toBe('Renamed on CF');

    const list = (await (await app.request('/api/canvases', { headers: authHeaders(token) })).json()) as CanvasMeta[];
    expect(list.map((c) => c.id)).toContain(meta.id);
  });

  it('auto-provisions a workspace with a seeded canvas on D1', async () => {
    const app = cfApp();
    const { token } = await devLogin(app, { email: 'cf@example.com', name: 'Cf' });

    const workspaces = (await (await app.request('/api/workspaces', { headers: authHeaders(token) })).json()) as Workspace[];
    expect(workspaces).toHaveLength(1);

    const canvases = (await (
      await app.request(`/api/canvases?workspace=${workspaces[0].id}`, { headers: authHeaders(token) })
    ).json()) as CanvasMeta[];
    expect(canvases.length).toBeGreaterThan(0);
  });

  it('publishes a version and serves its public permalink on D1', async () => {
    const app = cfApp();
    const { token } = await devLogin(app, { email: 'pub@example.com', name: 'Pub' });
    const meta = (await (
      await app.request('/api/canvases', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Published on CF' }),
      })
    ).json()) as CanvasMeta;

    const published = await app.request(`/api/canvases/${meta.id}/versions`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ description: 'v1', snapshot: { nodes: [], edges: [], viewport: null } }),
    });
    expect(published.status).toBe(201);
    const version = (await published.json()) as CanvasVersionMeta;
    expect(version.isPublic).toBe(false);
    expect((await app.request(`/api/versions/${version.id}`)).status).toBe(404);

    await app.request(`/api/canvases/${meta.id}/versions/${version.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ isPublic: true }),
    });

    const pub = await app.request(`/api/versions/${version.id}`);
    expect(pub.status).toBe(200);
    expect(((await pub.json()) as PublishedCanvasVersion).description).toBe('v1');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await cfApp().request('/api/canvases');
    expect(res.status).toBe(401);
  });
});
