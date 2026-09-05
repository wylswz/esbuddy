import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getEdgesMap, getNodesMap, isDocEmpty, snapshotToDoc, type CanvasSnapshot } from '@esbuddy/sdk';
import { LOCAL_ORIGIN } from './binding';
import { createCanvasProvider, type CanvasProvider } from './provider';

/** Everything the editor needs to collaborate on one canvas. */
export interface CollabSession {
  canvasId: string;
  doc: Y.Doc;
  provider: CanvasProvider;
  /** Undo/redo over this client's own edits only (peers' work is never undone). */
  undoManager: Y.UndoManager;
}

export interface CollabSessionOptions {
  /**
   * Called once, after the initial sync, if the document is still empty.
   * Return a snapshot to seed it with (legacy data, demo board…) or null.
   */
  seed?: () => CanvasSnapshot | null;
}

/**
 * Open a collaboration session for `canvasId`. Returns null until the initial
 * state has arrived, so the editor can render straight into populated arrays.
 * The session is torn down (and a new one opened) when `canvasId` changes.
 */
export function useCollabSession(canvasId: string, options: CollabSessionOptions = {}): CollabSession | null {
  const [session, setSession] = useState<CollabSession | null>(null);
  const { seed } = options;

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = createCanvasProvider(canvasId, doc);
    const undoManager = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 300,
    });
    let cancelled = false;

    void provider.whenSynced.then(() => {
      if (cancelled) return;
      if (isDocEmpty(doc)) {
        const snapshot = seed?.();
        // Untracked origin: seeding must not become an undo step.
        if (snapshot) snapshotToDoc(snapshot, doc, null);
      }
      setSession({ canvasId, doc, provider, undoManager });
    });

    return () => {
      cancelled = true;
      setSession(null);
      undoManager.destroy();
      provider.destroy();
      doc.destroy();
    };
    // Callers must memoise `seed` (e.g. useCallback on canvasId): a new closure
    // per render would reopen the session every time.
  }, [canvasId, seed]);

  return session;
}
