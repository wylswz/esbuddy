import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Db } from './db/types.js';
import type { Env } from './env.js';
import { CanvasRoom } from './modules/canvas/room.js';
import * as canvasService from './modules/canvas/service.js';
import { FLUSH_DEBOUNCE_MS, ROOM_IDLE_MS, authorizeRoomRequest, parseRoomPath } from './realtime.js';

/*
 * Node host for collaboration rooms (the counterpart of `room.worker.ts`).
 *
 * A single Node process is trivially a single writer, so the "one instance per
 * canvas" guarantee a Durable Object provides on Cloudflare is simply an
 * in-process Map here. Each room is hydrated from SQLite on first join and
 * flushed back (debounced) on edits, when its last participant leaves, and on
 * shutdown. Scaling this to several Node instances would need a shared fan-out
 * layer (e.g. y-redis) — deliberately out of scope for the single-container
 * deployment.
 */

interface HostedRoom {
  room: CanvasRoom;
  dirty: boolean;
  flushTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
}

export class RoomHost {
  private readonly rooms = new Map<string, Promise<HostedRoom | null>>();

  constructor(private readonly db: Db) {}

  /** Get (or hydrate) the room for a canvas; null if the canvas doesn't exist. */
  get(canvasId: string): Promise<HostedRoom | null> {
    let pending = this.rooms.get(canvasId);
    if (!pending) {
      pending = this.hydrate(canvasId);
      this.rooms.set(canvasId, pending);
      pending.then((h) => {
        if (!h) this.rooms.delete(canvasId);
      });
    }
    return pending;
  }

  private async hydrate(canvasId: string): Promise<HostedRoom | null> {
    const doc = await canvasService.loadCanvasDoc(this.db, canvasId);
    if (!doc) return null;
    const hosted: HostedRoom = { room: null as unknown as CanvasRoom, dirty: false, flushTimer: null, idleTimer: null };
    hosted.room = new CanvasRoom({
      doc,
      onUpdate: () => {
        hosted.dirty = true;
        if (hosted.flushTimer) clearTimeout(hosted.flushTimer);
        hosted.flushTimer = setTimeout(() => void this.flush(canvasId, hosted), FLUSH_DEBOUNCE_MS);
      },
    });
    return hosted;
  }

  async join(canvasId: string, ws: WebSocket): Promise<boolean> {
    const hosted = await this.get(canvasId);
    if (!hosted) return false;
    if (hosted.idleTimer) {
      clearTimeout(hosted.idleTimer);
      hosted.idleTimer = null;
    }

    const sock = { send: (data: Uint8Array) => ws.send(data) };
    ws.binaryType = 'arraybuffer';
    ws.on('message', (data: ArrayBuffer | Buffer | Buffer[]) => {
      const bytes =
        data instanceof ArrayBuffer ? new Uint8Array(data) : Array.isArray(data) ? Buffer.concat(data) : data;
      hosted.room.message(sock, new Uint8Array(bytes));
    });
    const leave = () => {
      hosted.room.disconnect(sock);
      if (hosted.room.size === 0) {
        void this.flush(canvasId, hosted);
        hosted.idleTimer = setTimeout(() => this.evict(canvasId, hosted), ROOM_IDLE_MS);
      }
    };
    ws.on('close', leave);
    ws.on('error', leave);
    hosted.room.connect(sock);
    return true;
  }

  private async flush(canvasId: string, hosted: HostedRoom): Promise<void> {
    if (hosted.flushTimer) {
      clearTimeout(hosted.flushTimer);
      hosted.flushTimer = null;
    }
    if (!hosted.dirty) return;
    hosted.dirty = false;
    try {
      await canvasService.saveCanvasDoc(this.db, canvasId, hosted.room.doc);
    } catch (err) {
      hosted.dirty = true;
      console.error(`[realtime] flush failed for canvas ${canvasId}`, err);
    }
  }

  private evict(canvasId: string, hosted: HostedRoom): void {
    if (hosted.room.size > 0) return;
    this.rooms.delete(canvasId);
    hosted.room.destroy();
  }

  /** Flush every dirty room (graceful shutdown). */
  async flushAll(): Promise<void> {
    await Promise.all(
      Array.from(this.rooms.entries()).map(async ([canvasId, pending]) => {
        const hosted = await pending;
        if (hosted) await this.flush(canvasId, hosted);
      }),
    );
  }
}

/**
 * Attach the realtime endpoint to an HTTP server. Upgrade requests for
 * `/api/rooms/:id` are authenticated and handed to the room; everything else
 * is left to whoever else listens (nobody, so the socket is destroyed).
 */
export function attachRealtime(server: Server, deps: { db: Db; env: Env }): RoomHost {
  const host = new RoomHost(deps.db);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!parseRoomPath(url.pathname)) {
      socket.destroy();
      return;
    }
    void authorizeRoomRequest(url, deps.env).then(async (auth) => {
      if (!auth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, async (ws) => {
        const ok = await host.join(auth.canvasId, ws);
        if (!ok) ws.close(4404, 'canvas not found');
      });
    });
  });

  return host;
}
