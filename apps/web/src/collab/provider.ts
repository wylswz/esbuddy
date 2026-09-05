import type * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { TOKEN_STORAGE_KEY, docToSnapshot } from '@esbuddy/sdk';
import * as storage from '../storage';
import { isRemoteMode } from '../stores/mode';
import { toFlowEdge, toFlowNode } from './binding';

/*
 * Where a canvas's Y.Doc is synced to, per deployment mode:
 *  - local  → IndexedDB in this browser only (y-indexeddb). Single user, but
 *             the editor still runs on the same CRDT code path.
 *  - remote → WebSocket to /api/rooms/:id (y-websocket protocol), hosted by
 *             the Node process or a Cloudflare Durable Object.
 */

export type ConnectionStatus = 'local' | 'connecting' | 'connected' | 'disconnected';

export interface CanvasProvider {
  readonly awareness: Awareness;
  /** Resolves once the initial state has been loaded (IndexedDB) or synced (server). */
  readonly whenSynced: Promise<void>;
  readonly status: ConnectionStatus;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  destroy(): void;
}

const LOCAL_DB_PREFIX = 'esbuddy.canvas.';

export function createCanvasProvider(canvasId: string, doc: Y.Doc): CanvasProvider {
  return isRemoteMode() ? createWebsocketProvider(canvasId, doc) : createLocalProvider(canvasId, doc);
}

/** Remove the IndexedDB database backing a canvas (local mode delete). */
export function deleteLocalCanvasDoc(canvasId: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LOCAL_DB_PREFIX + canvasId);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function createLocalProvider(canvasId: string, doc: Y.Doc): CanvasProvider {
  const persistence = new IndexeddbPersistence(LOCAL_DB_PREFIX + canvasId, doc);
  const awareness = new Awareness(doc);

  // The gallery (list + thumbnails) reads plain snapshots from localStorage, so
  // keep a materialised copy there — the IndexedDB doc stays the source of truth.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const materialise = () => {
    timer = null;
    const snapshot = docToSnapshot(doc);
    storage.saveCanvas(canvasId, {
      nodes: snapshot.nodes.map(toFlowNode),
      edges: snapshot.edges.map(toFlowEdge),
      viewport: storage.loadCanvas(canvasId)?.viewport ?? null,
    });
  };
  const onUpdate = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(materialise, 500);
  };
  doc.on('update', onUpdate);

  return {
    awareness,
    whenSynced: persistence.whenSynced.then(() => undefined),
    status: 'local',
    onStatus: () => () => {},
    destroy: () => {
      doc.off('update', onUpdate);
      if (timer) {
        clearTimeout(timer);
        materialise();
      }
      awareness.destroy();
      void persistence.destroy();
    },
  };
}

/** `VITE_API_URL` (default `/api`) → absolute ws(s) URL of the rooms endpoint. */
function roomsServerUrl(): string {
  const api = new URL(import.meta.env.VITE_API_URL ?? '/api', window.location.href);
  api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${api.href.replace(/\/$/, '')}/rooms`;
}

function createWebsocketProvider(canvasId: string, doc: Y.Doc): CanvasProvider {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  // The provider builds `<serverUrl>/<room>?<params>` → /api/rooms/:id?token=…
  const ws = new WebsocketProvider(roomsServerUrl(), canvasId, doc, { params: { token } });

  let status: ConnectionStatus = 'connecting';
  const listeners = new Set<(s: ConnectionStatus) => void>();
  ws.on('status', ({ status: next }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
    status = next;
    listeners.forEach((l) => l(next));
  });

  const whenSynced = new Promise<void>((resolve) => {
    if (ws.synced) resolve();
    else {
      const onSync = (synced: boolean) => {
        if (synced) {
          ws.off('sync', onSync);
          resolve();
        }
      };
      ws.on('sync', onSync);
    }
  });

  return {
    awareness: ws.awareness,
    whenSynced,
    get status() {
      return status;
    },
    onStatus: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    destroy: () => {
      listeners.clear();
      ws.destroy();
    },
  };
}
