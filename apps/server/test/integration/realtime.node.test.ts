import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import type { CanvasMeta, CanvasRecord, CreatedWorkspaceToken, Workspace } from '@esbuddy/sdk';
import { getNodesMap, writeNode } from '@esbuddy/sdk';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachRealtime, type RoomHost } from '../../src/realtime.node.js';
import { authHeaders, buildAppWithDb, devLogin, testEnv, type TestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

// End-to-end over a real socket: the Node host + `ws` on one side, the stock
// browser provider (y-websocket, on Node's global WebSocket) on the other.

const until = async (pred: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
};

describe('realtime rooms (Node host)', () => {
  let app: TestApp;
  let server: Server;
  let host: RoomHost;
  let base: string;
  let token: string;
  const providers: WebsocketProvider[] = [];

  beforeEach(async () => {
    const db = createTestDb();
    const env = testEnv();
    app = buildAppWithDb(db, env);
    server = serve({ fetch: app.fetch, port: 0 }) as Server;
    await new Promise<void>((r) => server.once('listening', r));
    host = attachRealtime(server, { db, env });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    ({ token } = await devLogin(app));
  });

  afterEach(async () => {
    providers.splice(0).forEach((p) => p.destroy());
    await new Promise<void>((r) => server.close(() => r()));
  });

  function connect(canvasId: string, tok = token) {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(`${base.replace('http', 'ws')}/api/rooms`, canvasId, doc, {
      params: { token: tok },
      // Node has BroadcastChannel too; force every byte through the server.
      disableBc: true,
    });
    providers.push(provider);
    return { doc, provider };
  }

  async function seededCanvas(): Promise<CanvasMeta> {
    const ws = (await (await fetch(`${base}/api/workspaces`, { headers: authHeaders(token) })).json()) as Workspace[];
    const list = (await (
      await fetch(`${base}/api/canvases?workspace=${ws[0].id}`, { headers: authHeaders(token) })
    ).json()) as CanvasMeta[];
    return list[0];
  }

  async function agentToken(name: string, role = 'editor'): Promise<CreatedWorkspaceToken> {
    const [workspace] = await (await app.request('/api/workspaces', { headers: authHeaders(token) })).json() as Workspace[];
    const res = await app.request(`/api/workspaces/${workspace.id}/tokens`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name, role }),
    });
    expect(res.status).toBe(201);
    return await res.json() as CreatedWorkspaceToken;
  }

  it('hydrates a legacy (snapshot-only) canvas and syncs edits to peers and to SQLite', async () => {
    const canvas = await seededCanvas();
    const a = connect(canvas.id);
    const b = connect(canvas.id);
    await until(() => a.provider.synced && b.provider.synced);

    // The seeded example lives only as JSON in `snapshot`; the room converted it.
    expect(getNodesMap(a.doc).size).toBeGreaterThan(0);
    expect(getNodesMap(b.doc).size).toBe(getNodesMap(a.doc).size);

    writeNode(getNodesMap(a.doc), { id: 'new', type: 'event', position: { x: 1, y: 2 }, data: { label: 'Hi' } }, 99);
    await until(() => getNodesMap(b.doc).has('new'));

    await host.flushAll();
    const rec = (await (await fetch(`${base}/api/canvases/${canvas.id}`, { headers: authHeaders(token) })).json()) as CanvasRecord;
    expect(rec.version).toBe(1);
    expect(rec.snapshot.nodes.find((n) => n.id === 'new')).toMatchObject({ position: { x: 1, y: 2 }, data: { label: 'Hi' } });

    // A late joiner gets the flushed state even after the room was evicted.
    a.provider.destroy();
    b.provider.destroy();
    const c = connect(canvas.id);
    await until(() => c.provider.synced);
    expect(getNodesMap(c.doc).has('new')).toBe(true);
  });

  it('rejects unauthenticated, unauthorised and unknown-canvas connections at the handshake', async () => {
    const canvas = await seededCanvas();
    // A valid session that isn't a member of the canvas's workspace.
    const { token: stranger } = await devLogin(app, { email: 'stranger@x.com', name: 'Stranger' });

    for (const [id, tok] of [
      [canvas.id, 'not-a-jwt'],
      [canvas.id, stranger],
      ['does-not-exist', token],
    ]) {
      const { provider } = connect(id, tok);
      let failed = false;
      provider.on('connection-error', () => {
        failed = true;
      });
      await until(() => failed);
      expect(provider.synced).toBe(false);
    }
  });

  it('lets a viewer sync but drops its edits', async () => {
    const canvas = await seededCanvas();
    const ws = (await (await fetch(`${base}/api/workspaces`, { headers: authHeaders(token) })).json()) as Workspace[];
    const invite = (await (
      await fetch(`${base}/api/workspaces/${ws[0].id}/invitations`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ role: 'viewer' }),
      })
    ).json()) as { token: string };
    const viewer = await devLogin(app, { email: 'viewer@x.com', name: 'Viewer' });
    await fetch(`${base}/api/invitations/${invite.token}/accept`, { method: 'POST', headers: authHeaders(viewer.token) });

    const editor = connect(canvas.id);
    const reader = connect(canvas.id, viewer.token);
    await until(() => editor.provider.synced && reader.provider.synced);
    expect(getNodesMap(reader.doc).size).toBe(getNodesMap(editor.doc).size);

    writeNode(getNodesMap(reader.doc), { id: 'sneaky', type: 'event', position: { x: 0, y: 0 }, data: {} }, 98);
    writeNode(getNodesMap(editor.doc), { id: 'legit', type: 'event', position: { x: 0, y: 0 }, data: {} }, 99);
    await until(() => getNodesMap(reader.doc).has('legit'));
    expect(getNodesMap(editor.doc).has('sneaky')).toBe(false);
  });

  it('collaborates as distinct agents with server-authoritative names, cursors and selections', async () => {
    const canvas = await seededCanvas();
    const expert = await agentToken('Domain expert');
    const critic = await agentToken('Challenger');
    const observer = connect(canvas.id);
    const a = connect(canvas.id, expert.token);
    const b = connect(canvas.id, critic.token);
    a.provider.awareness.setLocalState({});
    b.provider.awareness.setLocalState({});
    await until(() => observer.provider.synced && a.provider.synced && b.provider.synced);
    await until(() => observer.provider.awareness.getStates().get(a.doc.clientID)?.user?.id === expert.identity.id
      && observer.provider.awareness.getStates().get(b.doc.clientID)?.user?.id === critic.identity.id);
    a.provider.awareness.setLocalState({
      user: { id: 'fake-owner', name: 'Owner', color: '#000000' },
      cursor: { x: 10, y: 20 }, selection: ['new-a'],
    });
    b.provider.awareness.setLocalState({ user: { name: 'Fake' } });
    await until(() => observer.provider.awareness.getStates().get(a.doc.clientID)?.cursor?.x === 10
      && observer.provider.awareness.getStates().get(b.doc.clientID)?.user?.id === critic.identity.id);
    expect(observer.provider.awareness.getStates().get(a.doc.clientID)).toEqual({
      user: expert.identity, cursor: { x: 10, y: 20 }, selection: ['new-a'],
    });
    writeNode(getNodesMap(a.doc), { id: 'new-a', type: 'event', position: { x: 1, y: 2 }, data: { label: 'Expert idea' } }, 99);
    writeNode(getNodesMap(b.doc), { id: 'new-b', type: 'hotspot', position: { x: 5, y: 6 }, data: { label: 'Challenge' } }, 100);
    await until(() => getNodesMap(observer.doc).has('new-a') && getNodesMap(observer.doc).has('new-b'));
    await host.flushAll();
    a.provider.destroy();
    await until(() => !observer.provider.awareness.getStates().has(a.doc.clientID));
  });

  it('enforces workspace scope, read-only tokens and revocation on already connected sockets', async () => {
    const canvas = await seededCanvas();
    const viewer = await agentToken('Observer', 'viewer');
    const writer = await agentToken('Writer');
    const human = connect(canvas.id);
    const reader = connect(canvas.id, viewer.token);
    const agent = connect(canvas.id, writer.token);
    await until(() => human.provider.synced && reader.provider.synced && agent.provider.synced);
    writeNode(getNodesMap(reader.doc), { id: 'viewer-edit', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    writeNode(getNodesMap(agent.doc), { id: 'agent-edit', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    await until(() => getNodesMap(human.doc).has('agent-edit'));
    expect(getNodesMap(human.doc).has('viewer-edit')).toBe(false);

    const foreign = await (await app.request('/api/canvases', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name: 'Private canvas' }),
    })).json() as CanvasMeta;
    const forbidden = connect(foreign.id, writer.token);
    let rejected = false;
    forbidden.provider.on('connection-error', () => { rejected = true; });
    await until(() => rejected);
    forbidden.provider.destroy();

    reader.provider.shouldConnect = false;
    agent.provider.shouldConnect = false;
    for (const credential of [viewer, writer]) {
      expect((await app.request(`/api/workspaces/${credential.workspaceId}/tokens/${credential.id}`, {
        method: 'DELETE', headers: authHeaders(token),
      })).status).toBe(204);
    }
    writeNode(getNodesMap(agent.doc), { id: 'revoked-edit', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    // Silent revoked readers are disconnected before any subsequent broadcast reaches them.
    writeNode(getNodesMap(human.doc), { id: 'after-revoke', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    await until(() => !reader.provider.wsconnected && !agent.provider.wsconnected);
    expect(getNodesMap(human.doc).has('revoked-edit')).toBe(false);
    expect(getNodesMap(reader.doc).has('after-revoke')).toBe(false);
  });
});
