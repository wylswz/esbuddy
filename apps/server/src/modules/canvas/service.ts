import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot } from '@esbuddy/sdk';
import type { CanvasMeta, CanvasOwner, CanvasRecord, CanvasSnapshot } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import * as repo from './repo.js';

export function listCanvases(db: Db, userId: string, workspaceId?: string): Promise<CanvasMeta[]> {
  return repo.listCanvases(db, userId, workspaceId);
}

export function getCanvas(db: Db, id: string): Promise<CanvasRecord | null> {
  return repo.getCanvas(db, id);
}

export function createCanvas(db: Db, name: string, owner: CanvasOwner, createdById: string): Promise<CanvasMeta> {
  return repo.insertCanvas(db, { name, owner, snapshot: { nodes: [], edges: [], viewport: null }, createdById });
}

export function saveCanvas(
  db: Db,
  id: string,
  snapshot: CanvasSnapshot,
  name?: string,
  actorId?: string,
): Promise<CanvasMeta | null> {
  return repo.saveCanvas(db, id, snapshot, name, actorId);
}

export function renameCanvas(db: Db, id: string, name: string): Promise<CanvasMeta | null> {
  return repo.renameCanvas(db, id, name);
}

export function deleteCanvas(db: Db, id: string): Promise<void> {
  return repo.deleteCanvas(db, id);
}

export function listEvents(db: Db, canvasId: string, afterSeq?: number) {
  return repo.listEvents(db, canvasId, afterSeq);
}

/**
 * Seed a worked DDD example so a freshly created workspace is never empty on
 * first visit. Called by the workspace module during workspace creation.
 */
export function seedExampleCanvas(db: Db, workspaceId: string, ownerId: string): Promise<CanvasMeta> {
  return repo.insertCanvas(db, {
    name: EXAMPLE_CANVAS_NAME,
    owner: { type: 'workspace', workspaceId },
    snapshot: exampleCanvasSnapshot(),
    createdById: ownerId,
  });
}
