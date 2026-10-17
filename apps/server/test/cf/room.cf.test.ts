import type { CanvasMeta, CanvasRecord, CreatedWorkspaceToken, User, Workspace } from '@esbuddy/sdk';
import { getNodesMap, writeNode } from '@esbuddy/sdk';
import { SELF } from 'cloudflare:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { MSG_AWARENESS, MSG_SYNC } from '../../src/modules/canvas/room.js';

// Exercises the whole Cloudflare path inside workerd: Worker routing + JWT check
// → Durable Object (Hibernation WebSockets) → CanvasRoom → D1 flush.

const BASE = 'http://esbuddy.test';
const json = { 'content-type': 'application/json' };

const until = async (pred: () => boolean, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function login(email = 'room@example.com'): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/auth/dev-login`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, name: 'Roomy' }),
  });
  return ((await res.json()) as { token: string; user: User }).token;
}

async function seededCanvas(token: string): Promise<CanvasMeta> {
  const auth = { authorization: `Bearer ${token}` };
  const ws = (await (await SELF.fetch(`${BASE}/api/workspaces`, { headers: auth })).json()) as Workspace[];
  const list = (await (
    await SELF.fetch(`${BASE}/api/canvases?workspace=${ws[0].id}`, { headers: auth })
  ).json()) as CanvasMeta[];
  return list[0];
}

/** Open a room socket and drive the y-websocket sync handshake against `doc`. */
async function joinRoom(canvasId: string, token: string, doc: Y.Doc, extraHeaders: Record<string, string> = {}): Promise<WebSocket> {
  const res = await SELF.fetch(`${BASE}/api/rooms/${canvasId}?token=${token}`, {
    headers: { Upgrade: 'websocket', ...extraHeaders },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();

  const SERVER = Symbol('server');
  ws.addEventListener('message', (e: { data: unknown }) => {
    const decoder = decoding.createDecoder(new Uint8Array(e.data as ArrayBuffer));
    if (decoding.readVarUint(decoder) !== MSG_SYNC) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, doc, SERVER);
    if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
  });
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === SERVER) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  });

  const step1 = encoding.createEncoder();
  encoding.writeVarUint(step1, MSG_SYNC);
  syncProtocol.writeSyncStep1(step1, doc);
  ws.send(encoding.toUint8Array(step1));
  return ws;
}

describe('Cloudflare Durable Object rooms', () => {
  it('requires a valid token and a websocket upgrade', async () => {
    const token = await login();
    const canvas = await seededCanvas(token);

    expect((await SELF.fetch(`${BASE}/api/rooms/${canvas.id}?token=${token}`)).status).toBe(426);
    expect(
      (await SELF.fetch(`${BASE}/api/rooms/${canvas.id}?token=nope`, { headers: { Upgrade: 'websocket' } })).status,
    ).toBe(401);
    expect(
      (await SELF.fetch(`${BASE}/api/rooms/missing?token=${token}`, { headers: { Upgrade: 'websocket' } })).status,
    ).toBe(404);
    // Signed in, but not a member of the canvas's workspace: looks like a missing canvas.
    const stranger = await login('stranger@example.com');
    expect(
      (await SELF.fetch(`${BASE}/api/rooms/${canvas.id}?token=${stranger}`, { headers: { Upgrade: 'websocket' } })).status,
    ).toBe(404);
  });

  it('hydrates from D1, relays between two sockets and flushes back to D1', async () => {
    const token = await login();
    const canvas = await seededCanvas(token);

    const a = new Y.Doc();
    const b = new Y.Doc();
    const wsA = await joinRoom(canvas.id, token, a);
    const wsB = await joinRoom(canvas.id, token, b);
    await until(() => getNodesMap(a).size > 0 && getNodesMap(b).size > 0);
    expect(getNodesMap(a).size).toBe(getNodesMap(b).size);

    writeNode(getNodesMap(a), { id: 'cf-new', type: 'command', position: { x: 5, y: 6 }, data: { label: 'DO' } }, 99);
    await until(() => getNodesMap(b).has('cf-new'));

    // Last participant leaving triggers the cold flush.
    wsA.close();
    wsB.close();
    const auth = { authorization: `Bearer ${token}` };
    let rec: CanvasRecord | null = null;
    for (let i = 0; i < 100 && rec?.version !== 1; i++) {
      rec = (await (await SELF.fetch(`${BASE}/api/canvases/${canvas.id}`, { headers: auth })).json()) as CanvasRecord;
      if (rec.version !== 1) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rec?.version).toBe(1);
    expect(rec?.snapshot.nodes.find((n) => n.id === 'cf-new')).toMatchObject({ data: { label: 'DO' } });

    // A fresh joiner now reads the CRDT state (ydoc column), not the snapshot.
    const c = new Y.Doc();
    const wsC = await joinRoom(canvas.id, token, c);
    await until(() => getNodesMap(c).has('cf-new'));
    wsC.close();
  });

  it('enforces agent identities, viewer access and live token revocation through the real Worker', async () => {
    const session = await login('agents@example.com');
    const canvas = await seededCanvas(session);
    const workspaceId = canvas.owner.type === 'workspace' ? canvas.owner.workspaceId : '';
    const headers = { ...json, authorization: `Bearer ${session}` };
    const createToken = async (name: string, role: string) => {
      const res = await SELF.fetch(`${BASE}/api/workspaces/${workspaceId}/tokens`, {
        method: 'POST', headers, body: JSON.stringify({ name, role }),
      });
      expect(res.status).toBe(201);
      return await res.json() as CreatedWorkspaceToken;
    };
    const writer = await createToken('Expert', 'editor');
    const reader = await createToken('Observer', 'viewer');
    const humanDoc = new Y.Doc();
    const agentDoc = new Y.Doc();
    const readerDoc = new Y.Doc();
    const wsHuman = await joinRoom(canvas.id, session, humanDoc);
    const wsAgent = await joinRoom(canvas.id, 'unused-query', agentDoc, { authorization: `Bearer ${writer.token}` });
    // External clients cannot override the internal access/identity headers.
    const wsReader = await joinRoom(canvas.id, reader.token, readerDoc, {
      'x-esbuddy-room-readonly': '0', 'x-esbuddy-room-token': writer.id,
    });
    const presence = new awarenessProtocol.Awareness(humanDoc);
    presence.setLocalState(null);
    wsHuman.addEventListener('message', (event: { data: unknown }) => {
      const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
      if (decoding.readVarUint(decoder) === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(presence, decoding.readVarUint8Array(decoder), 'server');
      }
    });
    await until(() => getNodesMap(humanDoc).size > 0 && getNodesMap(agentDoc).size > 0 && getNodesMap(readerDoc).size > 0);
    const agentAwareness = new awarenessProtocol.Awareness(agentDoc);
    agentAwareness.setLocalState({ user: { id: 'owner', name: 'Spoofed' }, cursor: { x: 10, y: 20 } });
    const announce = encoding.createEncoder();
    encoding.writeVarUint(announce, MSG_AWARENESS);
    encoding.writeVarUint8Array(announce, awarenessProtocol.encodeAwarenessUpdate(agentAwareness, [agentDoc.clientID]));
    wsAgent.send(encoding.toUint8Array(announce));
    await until(() => presence.getStates().get(agentDoc.clientID)?.user?.id === writer.identity.id);
    expect(presence.getStates().get(agentDoc.clientID)?.user).toEqual(writer.identity);
    writeNode(getNodesMap(readerDoc), { id: 'forbidden', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    writeNode(getNodesMap(agentDoc), { id: 'allowed', type: 'note', position: { x: 0, y: 0 }, data: {} }, 99);
    await until(() => getNodesMap(humanDoc).has('allowed'));
    expect(getNodesMap(humanDoc).has('forbidden')).toBe(false);

    const closed = new Set<string>();
    wsAgent.addEventListener('close', () => closed.add('writer'));
    wsReader.addEventListener('close', () => closed.add('reader'));
    for (const credential of [writer, reader]) {
      expect((await SELF.fetch(`${BASE}/api/workspaces/${workspaceId}/tokens/${credential.id}`, {
        method: 'DELETE', headers,
      })).status).toBe(204);
    }
    writeNode(getNodesMap(agentDoc), { id: 'revoked-edit', type: 'note', position: { x: 0, y: 0 }, data: {} }, 100);
    writeNode(getNodesMap(humanDoc), { id: 'after-revoke', type: 'note', position: { x: 0, y: 0 }, data: {} }, 100);
    await until(() => closed.size === 2);
    expect(getNodesMap(humanDoc).has('revoked-edit')).toBe(false);
    expect(getNodesMap(readerDoc).has('after-revoke')).toBe(false);
    expect((await SELF.fetch(`${BASE}/api/rooms/${canvas.id}?token=${writer.token}`, {
      headers: { Upgrade: 'websocket' },
    })).status).toBe(401);
    wsHuman.close();
    presence.destroy();
    agentAwareness.destroy();
  });
});
