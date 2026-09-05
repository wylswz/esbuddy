import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import type { CanvasMeta, CanvasRecord, Workspace } from '@esbuddy/sdk';
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

  it('rejects unauthenticated and unknown-canvas connections', async () => {
    const canvas = await seededCanvas();

    const bad = connect(canvas.id, 'not-a-jwt');
    let failed = false;
    bad.provider.on('connection-error', () => {
      failed = true;
    });
    await until(() => failed);
    expect(bad.provider.synced).toBe(false);

    const missing = connect('does-not-exist');
    let closed = false;
    missing.provider.on('connection-close', () => {
      closed = true;
    });
    await until(() => closed);
    expect(missing.provider.synced).toBe(false);
  });
});
