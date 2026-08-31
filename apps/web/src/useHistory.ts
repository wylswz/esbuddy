import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';

export interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 100;

/**
 * Snapshot-based local undo/redo.
 *
 * Extensibility note for collaboration: this keeps full-state snapshots, the
 * simplest correct model for local undo. For future multi-user editing, swap
 * this out for a serializable operation/command log (each command can be
 * broadcast and applied by peers, or reconciled via CRDT). The `commit()`
 * call sites in App.tsx are the natural place to enqueue such commands, so
 * the rest of the app would not need to change.
 */
export function useHistory(
  getState: () => CanvasSnapshot,
  applyState: (snapshot: CanvasSnapshot) => void,
) {
  const pastRef = useRef<CanvasSnapshot[]>([]);
  const futureRef = useRef<CanvasSnapshot[]>([]);
  const coalescingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const commit = useCallback(() => {
    // Coalesce commits that land in the same task (deleting a node also removes
    // its connected edges in a separate onEdgesChange call).
    if (coalescingRef.current) return;
    coalescingRef.current = true;
    queueMicrotask(() => {
      coalescingRef.current = false;
    });

    pastRef.current.push(getState());
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    syncFlags();
  }, [getState, syncFlags]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(getState());
    applyState(prev);
    syncFlags();
  }, [getState, applyState, syncFlags]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(getState());
    applyState(next);
    syncFlags();
  }, [getState, applyState, syncFlags]);

  return { commit, undo, redo, canUndo, canRedo };
}
