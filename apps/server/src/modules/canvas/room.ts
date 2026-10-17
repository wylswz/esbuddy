import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { CollaborationIdentity } from '@esbuddy/sdk';
import type { AgentPresence } from '@esbuddy/sdk/agent';

/*
 * One collaboration room = one canvas = one Y.Doc + one Awareness instance, and
 * the set of sockets currently attached to it. Speaks the y-websocket wire
 * protocol (message 0 = sync, 1 = awareness) so the browser can use the stock
 * `y-websocket` provider.
 *
 * This class is platform-agnostic on purpose: it knows nothing about `ws`,
 * Durable Objects or databases. It is the single implementation of the room
 * semantics (fan-out, ordering, awareness bookkeeping) and each runtime wraps
 * it in a thin host:
 *   - Node  (`realtime.node.ts`): in-process Map<canvasId, CanvasRoom> + `ws`
 *   - CF    (`room.worker.ts`):   one Durable Object instance per canvas
 * The host owns persistence: it seeds the doc and listens to `onUpdate`.
 */

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

/** Minimal socket surface a host must provide. Identity is by reference. */
export interface RoomSocket {
  send(data: Uint8Array): void;
}

export interface CanvasRoomOptions {
  doc?: Y.Doc;
  /** Fired for every doc update (local or remote); hosts persist from here. */
  onUpdate?: (update: Uint8Array, origin: unknown) => void;
}

export class CanvasRoom {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  /** socket → awareness clientIDs it controls (removed on disconnect). */
  private readonly conns = new Map<RoomSocket, Set<number>>();
  /** Sockets that may read the doc but never write it (viewers). */
  private readonly readOnly = new Set<RoomSocket>();
  private readonly agents = new Map<RoomSocket, { identity: CollaborationIdentity; clientId?: number }>();

  constructor(options: CanvasRoomOptions = {}) {
    this.doc = options.doc ?? new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder), origin);
      options.onUpdate?.(update, origin);
    });

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const changed = added.concat(updated, removed);
        const controlled = this.conns.get(origin as RoomSocket);
        if (controlled) {
          for (const id of added.concat(updated)) controlled.add(id);
          for (const id of removed) controlled.delete(id);
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
        // Echo to the sender too: the y-websocket client treats 30s of silence
        // as a dead link, and its 15s awareness heartbeat is the only periodic
        // traffic — so a lone participant relies on this echo as keepalive.
        this.broadcast(encoding.toUint8Array(encoder), null);
      },
    );
  }

  get size(): number {
    return this.conns.size;
  }

  /**
   * Attach a socket. By default kicks off the handshake (sync step 1 + current
   * awareness). Pass `handshake: false` when re-attaching sockets that already
   * completed it (a Durable Object waking from hibernation).
   */
  connect(
    sock: RoomSocket,
    opts: {
      handshake?: boolean;
      controlledIds?: Iterable<number>;
      readOnly?: boolean;
      identity?: CollaborationIdentity;
    } = {},
  ): void {
    this.conns.set(sock, new Set(opts.controlledIds ?? []));
    if (opts.readOnly) this.readOnly.add(sock);
    if (opts.identity) {
      this.agents.set(sock, { identity: opts.identity, clientId: this.controlledIds(sock)[0] });
    }
    if (opts.handshake === false) return;

    const sync = encoding.createEncoder();
    encoding.writeVarUint(sync, MSG_SYNC);
    syncProtocol.writeSyncStep1(sync, this.doc);
    sock.send(encoding.toUint8Array(sync));

    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aw = encoding.createEncoder();
      encoding.writeVarUint(aw, MSG_AWARENESS);
      encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())));
      sock.send(encoding.toUint8Array(aw));
    }
  }

  /** Handle one inbound wire message from `sock`. */
  message(sock: RoomSocket, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    switch (decoding.readVarUint(decoder)) {
      case MSG_SYNC:
        encoding.writeVarUint(encoder, MSG_SYNC);
        if (this.readOnly.has(sock)) {
          // A viewer may ask for the state (step 1) but its step 2 / updates are dropped.
          if (decoding.readVarUint(decoder) === syncProtocol.messageYjsSyncStep1) {
            syncProtocol.readSyncStep1(decoder, encoder, this.doc);
          }
        } else {
          // Applies step2/updates to the doc with `sock` as origin; may queue a reply.
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, sock);
        }
        if (encoding.length(encoder) > 1) sock.send(encoding.toUint8Array(encoder));
        break;
      case MSG_AWARENESS:
        {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness, this.agents.has(sock) ? this.agentAwareness(sock, update) : update, sock,
          );
        }
        break;
    }
  }

  /** Detach a socket and retract the awareness states it owned. */
  disconnect(sock: RoomSocket): void {
    const controlled = this.conns.get(sock);
    this.conns.delete(sock);
    this.readOnly.delete(sock);
    this.agents.delete(sock);
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(controlled), null);
    }
  }

  /** Awareness clientIDs owned by `sock` (hosts persist this across hibernation). */
  controlledIds(sock: RoomSocket): number[] {
    return Array.from(this.conns.get(sock) ?? []);
  }

  /** Retract awareness for ids whose socket is gone but was never `connect`ed here. */
  removeAwareness(ids: number[]): void {
    if (ids.length > 0) awarenessProtocol.removeAwarenessStates(this.awareness, ids, null);
  }

  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Stable virtual awareness IDs let HTTP agents survive DO hibernation without a WebSocket. */
  setAgentPresence(identity: CollaborationIdentity, presence?: AgentPresence | null): void {
    let hash = 1469598103934665603n;
    for (const char of identity.id) hash = ((hash ^ BigInt(char.charCodeAt(0))) * 1099511628211n) & ((1n << 48n) - 1n);
    // Above the ordinary 32-bit Yjs client-ID range.
    const id = Number(hash) + 2 ** 32;
    const previous = this.awareness.getStates().get(id);
    const state = presence === null ? null : {
      user: identity,
      cursor: presence === undefined ? previous?.cursor ?? null : presence.cursor,
      selection: presence?.selection ?? previous?.selection ?? [],
    };
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, id);
    encoding.writeVarUint(encoder, Math.max(Date.now(), (this.awareness.meta.get(id)?.clock ?? 0) + 1));
    encoding.writeVarString(encoder, JSON.stringify(state));
    awarenessProtocol.applyAwarenessUpdate(this.awareness, encoding.toUint8Array(encoder), null);
  }

  destroy(): void {
    this.awareness.destroy();
    this.doc.destroy();
    this.conns.clear();
    this.readOnly.clear();
    this.agents.clear();
  }

  /** Token clients control their cursor/selection, never their authenticated name or another peer's state. */
  private agentAwareness(sock: RoomSocket, update: Uint8Array): Uint8Array {
    const agent = this.agents.get(sock)!;
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    const accepted: { id: number; clock: number; state: unknown }[] = [];
    for (let i = 0; i < count; i++) {
      const id = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state: unknown = JSON.parse(decoding.readVarString(decoder));
      const ownedByOtherSocket = Array.from(this.conns).some(([other, ids]) => other !== sock && ids.has(id));
      if (ownedByOtherSocket) continue;
      if (agent.clientId === undefined && state !== null
        && id !== this.doc.clientID && !this.awareness.getStates().has(id)) agent.clientId = id;
      if (id !== agent.clientId) continue;
      if (state === null) {
        accepted.push({ id, clock, state: null });
        continue;
      }
      const value = state && typeof state === 'object' ? state as Record<string, unknown> : {};
      const cursor = value.cursor as { x?: unknown; y?: unknown } | null | undefined;
      accepted.push({
        id, clock,
        state: {
          user: agent.identity,
          cursor: cursor && typeof cursor.x === 'number' && Number.isFinite(cursor.x)
            && typeof cursor.y === 'number' && Number.isFinite(cursor.y)
            ? { x: cursor.x, y: cursor.y } : null,
          selection: Array.isArray(value.selection)
            ? value.selection.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [],
        },
      });
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, accepted.length);
    for (const entry of accepted) {
      encoding.writeVarUint(encoder, entry.id);
      encoding.writeVarUint(encoder, entry.clock);
      encoding.writeVarString(encoder, JSON.stringify(entry.state));
    }
    return encoding.toUint8Array(encoder);
  }

  private broadcast(data: Uint8Array, except: unknown): void {
    for (const sock of this.conns.keys()) {
      if (sock === except) continue;
      try {
        sock.send(data);
      } catch {
        // A dead socket; the host will call disconnect() from its close handler.
      }
    }
  }
}
