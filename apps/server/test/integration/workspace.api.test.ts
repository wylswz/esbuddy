import type { CanvasMeta, Invitation, InvitationPreview, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';
import { authHeaders, buildAppWithDb, devLogin, testEnv, type TestApp } from '../helpers/app.js';
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

  it('previews a share invitation without joining', async () => {
    const app = buildAppWithDb(createTestDb());
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);

    const invite = (await (
      await app.request(`/api/workspaces/${ws.id}/invitations`, {
        method: 'POST',
        headers: authHeaders(alice.token),
        body: JSON.stringify({ role: 'viewer' }),
      })
    ).json()) as Invitation;

    const bob = await devLogin(app, { email: 'bob@x.com', name: 'Bob' });
    const preview = (await (
      await app.request(`/api/invitations/${invite.token}`, { headers: authHeaders(bob.token) })
    ).json()) as InvitationPreview;
    expect(preview).toMatchObject({ valid: true, workspaceName: ws.name, role: 'viewer' });

    // Previewing must not add the user as a member.
    const members = (await (
      await app.request(`/api/workspaces/${ws.id}/members`, { headers: authHeaders(alice.token) })
    ).json()) as WorkspaceMember[];
    expect(members.map((m) => m.userId)).not.toContain(bob.user.id);
  });

  it('reports an invalid token as not valid', async () => {
    const app = buildAppWithDb(createTestDb());
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const preview = (await (
      await app.request('/api/invitations/nope', { headers: authHeaders(alice.token) })
    ).json()) as InvitationPreview;
    expect(preview.valid).toBe(false);
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

  it('owner can delete a workspace (cascade)', async () => {
    const app = buildAppWithDb(createTestDb());
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);

    // Workspace has a seeded canvas.
    const canvasesBefore = (await (
      await app.request(`/api/canvases?workspace=${ws.id}`, { headers: authHeaders(alice.token) })
    ).json()) as CanvasMeta[];
    expect(canvasesBefore.length).toBeGreaterThan(0);

    const res = await app.request(`/api/workspaces/${ws.id}`, {
      method: 'DELETE',
      headers: authHeaders(alice.token),
    });
    expect(res.status).toBe(204);

    // Workspace is gone from the list.
    const list = (await (
      await app.request('/api/workspaces', { headers: authHeaders(alice.token) })
    ).json()) as Workspace[];
    expect(list.find((w) => w.id === ws.id)).toBeUndefined();

    // Canvases for the deleted workspace are gone.
    const canvasesAfter = (await (
      await app.request(`/api/canvases?workspace=${ws.id}`, { headers: authHeaders(alice.token) })
    ).json()) as CanvasMeta[];
    expect(canvasesAfter).toHaveLength(0);
  });

  it('non-owners cannot delete a workspace', async () => {
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

    const res = await app.request(`/api/workspaces/${ws.id}`, {
      method: 'DELETE',
      headers: authHeaders(bob.token),
    });
    expect(res.status).toBe(404);

    // Workspace still exists.
    const list = (await (
      await app.request('/api/workspaces', { headers: authHeaders(alice.token) })
    ).json()) as Workspace[];
    expect(list.find((w) => w.id === ws.id)).toBeDefined();
  });

  it('enforces max workspaces per user', async () => {
    const app = buildAppWithDb(createTestDb(), testEnv({ MAX_WORKSPACES_PER_USER: '1' }));
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    // Alice already has 1 auto-provisioned workspace.
    const res = await app.request('/api/workspaces', {
      method: 'POST',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ name: 'Second' }),
    });
    expect(res.status).toBe(403);
  });

  it('enforces max canvases per workspace', async () => {
    const app = buildAppWithDb(createTestDb(), testEnv({ MAX_CANVASES_PER_WORKSPACE: '1' }));
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);
    // Workspace already has 1 seeded canvas.
    const res = await app.request('/api/canvases', {
      method: 'POST',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ name: 'Extra', owner: { type: 'workspace', workspaceId: ws.id } }),
    });
    expect(res.status).toBe(403);
  });

  it('enforces max members per workspace on invitation accept', async () => {
    const app = buildAppWithDb(createTestDb(), testEnv({ MAX_MEMBERS_PER_WORKSPACE: '1' }));
    const alice = await devLogin(app, { email: 'alice@x.com', name: 'Alice' });
    const ws = await firstWorkspace(app, alice.token);
    // Alice is the only member (count = 1); cap at 1 means no new members.
    const invite = (await (
      await app.request(`/api/workspaces/${ws.id}/invitations`, {
        method: 'POST',
        headers: authHeaders(alice.token),
        body: JSON.stringify({ role: 'editor' }),
      })
    ).json()) as Invitation;

    const bob = await devLogin(app, { email: 'bob@x.com', name: 'Bob' });
    const res = await app.request(`/api/invitations/${invite.token}/accept`, {
      method: 'POST',
      headers: authHeaders(bob.token),
    });
    expect(res.status).toBe(403);
  });
});
