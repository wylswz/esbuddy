import type { CanvasMeta, Invitation, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

async function firstWorkspace(app: TestApp, token: string): Promise<Workspace> {
  const res = await app.request('/api/workspaces', { headers: authHeaders(token) });
  const list = (await res.json()) as Workspace[];
  return list[0];
}

describe('workspace API', () => {
  it('auto-provisions a personal workspace with a seeded canvas', async () => {
    const app = buildAppWithDb(createTestDb());
    const { token } = await devLogin(app, { name: 'Alice' });

    const ws = await firstWorkspace(app, token);
    expect(ws.name).toBe("Alice's Workspace");

    const canvases = (await (
      await app.request(`/api/canvases?workspace=${ws.id}`, { headers: authHeaders(token) })
    ).json()) as CanvasMeta[];
    expect(canvases.length).toBeGreaterThan(0);
  });

  it('supports an invite -> accept flow between two users', async () => {
    const app = buildAppWithDb(createTestDb());
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);

    const invite = (await (
      await app.request(`/api/workspaces/${ws.id}/invitations`, {
        method: 'POST',
        headers: authHeaders(alice.token),
        body: JSON.stringify({ role: 'editor' }),
      })
    ).json()) as Invitation;
    expect(invite.token).toBeTruthy();

    const bob = await devLogin(app, { email: 'bob@x.com', name: 'Bob' });
    const accepted = await app.request(`/api/invitations/${invite.token}/accept`, {
      method: 'POST',
      headers: authHeaders(bob.token),
    });
    expect(accepted.status).toBe(200);

    const members = (await (
      await app.request(`/api/workspaces/${ws.id}/members`, { headers: authHeaders(bob.token) })
    ).json()) as WorkspaceMember[];
    expect(members.map((m) => m.userId)).toContain(bob.user.id);
  });

  it('non-owners cannot invite', async () => {
    const app = buildAppWithDb(createTestDb());
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);

    const invite = (await (
      await app.request(`/api/workspaces/${ws.id}/invitations`, {
        method: 'POST',
        headers: authHeaders(alice.token),
        body: JSON.stringify({ role: 'editor' }),
      })
    ).json()) as Invitation;

    const bob = await devLogin(app, { email: 'bob@x.com', name: 'Bob' });
    await app.request(`/api/invitations/${invite.token}/accept`, {
      method: 'POST',
      headers: authHeaders(bob.token),
    });

    const res = await app.request(`/api/workspaces/${ws.id}/invitations`, {
      method: 'POST',
      headers: authHeaders(bob.token),
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(res.status).toBe(403);
  });
});
