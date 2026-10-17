import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import {
  getLanesMap,
  getMilestonesMap,
  readStructure,
  writeLane,
  writeMilestone,
  type CanvasLane,
  type CanvasMilestone,
  type CanvasStructure,
  type YElements,
} from '@esbuddy/sdk';
import { newId } from '../ids';
import { LOCAL_ORIGIN } from './binding';

/*
 * Board structure (swimlanes, milestones) lives in its own Y.Maps (schema in
 * @esbuddy/sdk `ydoc.ts`). Unlike notes there is no React-side copy to diff:
 * edits are written straight to the doc and every change — ours, peers', undo —
 * is read back from it.
 */

/** Live board structure, re-read whenever any client changes it. */
export function useStructure(doc: Y.Doc): CanvasStructure {
  const [structure, setStructure] = useState(() => readStructure(doc));
  useEffect(() => {
    const maps = [getLanesMap(doc), getMilestonesMap(doc)];
    const sync = () => setStructure(readStructure(doc));
    maps.forEach((m) => m.observeDeep(sync));
    sync();
    return () => maps.forEach((m) => m.unobserveDeep(sync));
  }, [doc]);
  return structure;
}

/** Patch fields in place so concurrent edits to different fields both survive. */
function patch(map: YElements, id: string, fields: Record<string, unknown>): void {
  const y = map.get(id);
  if (!y) return;
  for (const [k, v] of Object.entries(fields)) if (y.get(k) !== v) y.set(k, v);
}

export interface StructureEditor {
  addLane(lane: Omit<CanvasLane, 'id'>): string;
  updateLane(id: string, fields: Partial<Omit<CanvasLane, 'id'>>): void;
  removeLane(id: string): void;
  addMilestone(milestone: Omit<CanvasMilestone, 'id'>): string;
  updateMilestone(id: string, fields: Partial<Omit<CanvasMilestone, 'id'>>): void;
  removeMilestone(id: string): void;
}

/** Local edits to the structure, tagged LOCAL_ORIGIN so they are undoable. */
export function structureEditor(doc: Y.Doc): StructureEditor {
  const lanes = getLanesMap(doc);
  const milestones = getMilestonesMap(doc);
  const tx = (fn: () => void) => doc.transact(fn, LOCAL_ORIGIN);
  return {
    addLane(lane) {
      const id = newId('lane');
      tx(() => writeLane(lanes, { id, ...lane }));
      return id;
    },
    updateLane: (id, fields) => tx(() => patch(lanes, id, fields)),
    removeLane: (id) => tx(() => lanes.delete(id)),
    addMilestone(milestone) {
      const id = newId('milestone');
      tx(() => writeMilestone(milestones, { id, ...milestone }));
      return id;
    },
    updateMilestone: (id, fields) => tx(() => patch(milestones, id, fields)),
    removeMilestone: (id) => tx(() => milestones.delete(id)),
  };
}
