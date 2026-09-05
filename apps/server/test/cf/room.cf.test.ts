import type { CanvasMeta, CanvasRecord, User, Workspace } from '@esbuddy/sdk';
import { getNodesMap, writeNode } from '@esbuddy/sdk';
import { SELF } from 'cloudflare:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { MSG_SYNC } from '../../src/modules/canvas/room.js';

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

async function login(): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/auth/dev-login`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email: 'room@example.com', name: 'Roomy' }),
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
async function joinRoom(canvasId: string, token: string, doc: Y.Doc): Promise<WebSocket> {
  const res = await SELF.fetch(`${BASE}/api/rooms/${canvasId}?token=${token}`, {
    headers: { Upgrade: 'websocket' },
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
});
