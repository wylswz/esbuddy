import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { docFromSnapshot, exampleCanvasSnapshot, getNodesMap } from '@esbuddy/sdk';
import { describe, expect, it, vi } from 'vitest';
import { CanvasRoom, MSG_AWARENESS, MSG_SYNC, type RoomSocket } from '../../src/modules/canvas/room.js';

/**
 * A minimal in-memory y-websocket *client*: a Y.Doc + Awareness wired to a
 * room through a fake socket, speaking the same wire protocol the browser
 * provider does. Lets us test the room without any network.
 */
function connectClient(room: CanvasRoom) {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const SERVER = Symbol('server');
  const send = (bytes: Uint8Array) => room.message(sock, bytes);

  const sock: RoomSocket = {
    send(data) {
      const decoder = decoding.createDecoder(data);
      switch (decoding.readVarUint(decoder)) {
        case MSG_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, doc, SERVER);
          if (encoding.length(encoder) > 1) send(encoding.toUint8Array(encoder));
          break;
        }
        case MSG_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), SERVER);
          break;
      }
    },
  };

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === SERVER) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  });
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === SERVER) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed)),
    );
    send(encoding.toUint8Array(encoder));
  });

  room.connect(sock);
  // Like the real provider: ask the server for its state too.
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(encoding.toUint8Array(encoder));

  return { doc, awareness, sock, disconnect: () => room.disconnect(sock) };
}

describe('CanvasRoom', () => {
  it('hands the current document to a joining client', () => {
    const room = new CanvasRoom({ doc: docFromSnapshot(exampleCanvasSnapshot()) });
    const client = connectClient(room);
    expect(getNodesMap(client.doc).size).toBe(exampleCanvasSnapshot().nodes.length);
    expect(room.size).toBe(1);
  });

  it('relays edits between clients and reports them to the host', () => {
    const onUpdate = vi.fn();
    const room = new CanvasRoom({ onUpdate });
    const a = connectClient(room);
    const b = connectClient(room);

    const node = new Y.Map<unknown>();
    node.set('type', 'event');
    node.set('x', 1);
    getNodesMap(a.doc).set('n1', node);

    expect(getNodesMap(b.doc).get('n1')?.get('x')).toBe(1);
    expect(getNodesMap(room.doc).get('n1')?.get('x')).toBe(1);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('propagates awareness and retracts it when a client leaves', () => {
    const room = new CanvasRoom();
    const a = connectClient(room);
    const b = connectClient(room);

    a.awareness.setLocalState({ user: { id: 'u1', name: 'Alice' } });
    expect(b.awareness.getStates().get(a.awareness.clientID)).toMatchObject({ user: { id: 'u1' } });

    a.disconnect();
    expect(b.awareness.getStates().has(a.awareness.clientID)).toBe(false);
    expect(room.size).toBe(1);
  });

  it('re-attaching after hibernation keeps controlled awareness ids', () => {
    const room = new CanvasRoom();
    const a = connectClient(room);
    a.awareness.setLocalState({ user: { id: 'u1' } });
    const ids = room.controlledIds(a.sock);
    expect(ids).toEqual([a.awareness.clientID]);

    // Simulate a DO waking up with a fresh room and the same (already synced) socket.
    const woken = new CanvasRoom({ doc: room.doc });
    const sent: Uint8Array[] = [];
    const sock: RoomSocket = { send: (d) => sent.push(d) };
    woken.connect(sock, { handshake: false, controlledIds: ids });
    expect(sent).toHaveLength(0);
    expect(woken.controlledIds(sock)).toEqual(ids);
  });
});
