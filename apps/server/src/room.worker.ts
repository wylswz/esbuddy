/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import { createD1Db } from './db/d1.worker.js';
import type { WorkerBindings } from './env.worker.js';
import { CanvasRoom, type RoomSocket } from './modules/canvas/room.js';
import * as canvasService from './modules/canvas/service.js';
import { FLUSH_DEBOUNCE_MS, isWebSocketUpgrade, parseRoomPath } from './realtime.js';

/*
 * Cloudflare host for collaboration rooms (the counterpart of `realtime.node.ts`).
 *
 * One Durable Object instance per canvas (`idFromName(canvasId)`), so every
 * participant of a canvas lands on the same single-threaded object — that is
 * the fan-out point and the single writer. The room logic itself lives in the
 * platform-agnostic `CanvasRoom`; this class only adapts Workers primitives:
 *
 *  - WebSockets use the Hibernation API (`acceptWebSocket` + `webSocket*`
 *    handlers) so an idle room costs nothing while connections stay open. On
 *    wake, in-memory state is gone: the doc is rebuilt from DO storage and the
 *    surviving sockets are re-attached without redoing the handshake.
 *  - Hot state (the Y.Doc) is persisted to DO storage on a short debounce;
 *    the cold copy (D1 `ydoc` + materialised `snapshot`) is flushed by an
 *    alarm and when the last participant leaves.
 */

const HOT_PERSIST_MS = 250;
const COLD_FLUSH_MS = FLUSH_DEBOUNCE_MS * 10;

interface Attachment {
  /** Awareness clientIDs owned by this socket (survives hibernation). */
  ids?: number[];
}

export class CanvasRoomObject extends DurableObject<WorkerBindings> {
  private room: CanvasRoom | null = null;
  private canvasId: string | null = null;
  private readonly socks = new Map<WebSocket, RoomSocket>();
  private dirty = false;
  private hotTimer: ReturnType<typeof setTimeout> | null = null;

  async fetch(request: Request): Promise<Response> {
    const canvasId = parseRoomPath(new URL(request.url).pathname);
    if (!canvasId || !isWebSocketUpgrade(request.headers)) {
      return new Response('expected websocket upgrade', { status: 426 });
    }
    const room = await this.ensureRoom(canvasId);
    if (!room) return new Response('canvas not found', { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ids: [] } satisfies Attachment);
    room.connect(this.wrap(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message === 'string') return;
    const room = await this.ensureRoom();
    if (!room) {
      ws.close(4404, 'canvas not found');
      return;
    }
    const sock = this.wrap(ws);
    room.message(sock, new Uint8Array(message));
    ws.serializeAttachment({ ids: room.controlledIds(sock) } satisfies Attachment);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  async alarm(): Promise<void> {
    await this.flushCold();
  }

  private async leave(ws: WebSocket): Promise<void> {
    const room = await this.ensureRoom();
    const sock = this.socks.get(ws);
    this.socks.delete(ws);
    if (!room) return;
    if (sock) room.disconnect(sock);
    else room.removeAwareness((ws.deserializeAttachment() as Attachment | null)?.ids ?? []);
    if (room.size === 0) await this.flushCold();
  }

  private wrap(ws: WebSocket): RoomSocket {
    let sock = this.socks.get(ws);
    if (!sock) {
      sock = {
        send: (data) => {
          ws.send(data);
        },
      };
      this.socks.set(ws, sock);
    }
    return sock;
  }

  /**
   * Return the live room, rebuilding it after hibernation (or first load).
   * `canvasId` is only needed on the very first request; afterwards it is
   * remembered in DO storage.
   */
  private async ensureRoom(canvasId?: string): Promise<CanvasRoom | null> {
    if (this.room) return this.room;
    canvasId ??= this.canvasId ?? (await this.ctx.storage.get<string>('canvasId'));
    if (!canvasId) return null;

    let doc: Y.Doc;
    const hot = await this.ctx.storage.get<Uint8Array>('doc');
    if (hot) {
      doc = new Y.Doc();
      Y.applyUpdate(doc, hot);
    } else {
      const loaded = await canvasService.loadCanvasDoc(createD1Db(this.env.DB), canvasId);
      if (!loaded) {
        // Canvas deleted (or never existed): drop any stale state for this id.
        await this.ctx.storage.deleteAll();
        return null;
      }
      doc = loaded;
    }

    this.canvasId = canvasId;
    await this.ctx.storage.put('canvasId', canvasId);
    this.room = new CanvasRoom({ doc, onUpdate: () => this.markDirty() });

    // Sockets that survived hibernation already completed the handshake.
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      this.room.connect(this.wrap(ws), { handshake: false, controlledIds: att?.ids });
    }
    return this.room;
  }

  private markDirty(): void {
    this.dirty = true;
    if (!this.hotTimer) {
      this.hotTimer = setTimeout(() => {
        this.hotTimer = null;
        void this.persistHot();
      }, HOT_PERSIST_MS);
    }
    void this.ctx.storage.getAlarm().then((at) => {
      if (at === null) return this.ctx.storage.setAlarm(Date.now() + COLD_FLUSH_MS);
    });
  }

  private async persistHot(): Promise<void> {
    if (this.room) await this.ctx.storage.put('doc', this.room.encodeState());
  }

  private async flushCold(): Promise<void> {
    if (!this.room || !this.canvasId || !this.dirty) return;
    this.dirty = false;
    await this.persistHot();
    try {
      await canvasService.saveCanvasDoc(createD1Db(this.env.DB), this.canvasId, this.room.doc);
    } catch (err) {
      this.dirty = true;
      console.error(`[realtime] D1 flush failed for canvas ${this.canvasId}`, err);
      await this.ctx.storage.setAlarm(Date.now() + COLD_FLUSH_MS);
    }
  }
}
