import type { CanvasMeta, Invitation, Role, Workspace } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

// Authorization: being logged in is not enough — access follows canvas ownership
// and workspace membership, and viewers can only read.

async function setup() {
  const app = buildAppWithDb(createTestDb());
  const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
  const ws = ((await (await app.request('/api/workspaces', { headers: authHeaders(alice.token) })).json()) as Workspace[])[0];
  const canvas = ((await (
    await app.request(`/api/canvases?workspace=${ws.id}`, { headers: authHeaders(alice.token) })
  ).json()) as CanvasMeta[])[0];
  return { app, alice, ws, canvas };
}

async function join(app: TestApp, ownerToken: string, workspaceId: string, role: Role, email: string) {
  const invite = (await (
    await app.request(`/api/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ role }),
    })
  ).json()) as Invitation;
  const user = await devLogin(app, { email, name: email });
  await app.request(`/api/invitations/${invite.token}/accept`, { method: 'POST', headers: authHeaders(user.token) });
  return user;
}

const snapshot = { nodes: [], edges: [], viewport: null };

describe('authorization', () => {
  it('a non-member sees nothing of another workspace (404 everywhere)', async () => {
    const { app, alice, ws, canvas } = await setup();
    const mallory = await devLogin(app, { email: 'mallory@x.com', name: 'Mallory' });
    const h = authHeaders(mallory.token);

    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/canvases?workspace=${ws.id}`],
      ['GET', `/api/canvases/${canvas.id}`],
      ['PATCH', `/api/canvases/${canvas.id}`, { name: 'pwned' }],
      ['DELETE', `/api/canvases/${canvas.id}`],
      ['GET', `/api/canvases/${canvas.id}/versions`],
      ['POST', `/api/canvases/${canvas.id}/versions`, { snapshot }],
      ['GET', `/api/workspaces/${ws.id}/members`],
      ['POST', '/api/canvases', { name: 'x', owner: { type: 'workspace', workspaceId: ws.id } }],
      ['POST', '/api/canvases', { name: 'x', owner: { type: 'user', userId: alice.user.id } }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await app.request(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    // Nothing changed for the owner.
    const res = await app.request(`/api/canvases/${canvas.id}`, { headers: authHeaders(alice.token) });
    expect(((await res.json()) as CanvasMeta).name).toBe(canvas.name);
  });

  it('a viewer can read but not write', async () => {
    const { app, alice, ws, canvas } = await setup();
    const bob = await join(app, alice.token, ws.id, 'viewer', 'bob@x.com');
    const h = authHeaders(bob.token);

    expect((await app.request(`/api/canvases?workspace=${ws.id}`, { headers: h })).status).toBe(200);
    expect((await app.request(`/api/canvases/${canvas.id}`, { headers: h })).status).toBe(200);
    expect((await app.request(`/api/canvases/${canvas.id}/versions`, { headers: h })).status).toBe(200);
    expect((await app.request(`/api/workspaces/${ws.id}/members`, { headers: h })).status).toBe(200);

    const writes: [string, string, unknown?][] = [
      ['PATCH', `/api/canvases/${canvas.id}`, { name: 'renamed' }],
      ['DELETE', `/api/canvases/${canvas.id}`],
      ['POST', `/api/canvases/${canvas.id}/versions`, { snapshot }],
      ['POST', '/api/canvases', { name: 'x', owner: { type: 'workspace', workspaceId: ws.id } }],
    ];
    for (const [method, path, body] of writes) {
      const res = await app.request(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('an editor can write', async () => {
    const { app, alice, ws, canvas } = await setup();
    const carol = await join(app, alice.token, ws.id, 'editor', 'carol@x.com');
    const res = await app.request(`/api/canvases/${canvas.id}`, {
      method: 'PATCH',
      headers: authHeaders(carol.token),
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
  });

  it('invitations cannot hand out ownership', async () => {
    const { app, alice, ws } = await setup();
    const res = await app.request(`/api/workspaces/${ws.id}/invitations`, {
      method: 'POST',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(400);
  });
});
