import type * as Y from 'yjs';
import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot } from '@esbuddy/sdk';
import type { CanvasMeta, CanvasOwner, CanvasRecord } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { LimitError, type Limits } from '../../limits.js';
import * as repo from './repo.js';

export function listCanvases(db: Db, userId: string, workspaceId?: string): Promise<CanvasMeta[]> {
  return repo.listCanvases(db, userId, workspaceId);
}

export function getCanvas(db: Db, id: string): Promise<CanvasRecord | null> {
  return repo.getCanvas(db, id);
}

/**
 * Create a canvas. When `limits` is provided, enforces the max-canvases-per-
 * workspace cap for workspace-owned canvases. Pass `undefined` for internal
 * calls (e.g. `seedExampleCanvas`) that must bypass it.
 */
export async function createCanvas(
  db: Db,
  name: string,
  owner: CanvasOwner,
  createdById: string,
  limits?: Limits,
): Promise<CanvasMeta> {
  if (limits?.maxCanvasesPerWorkspace !== undefined && owner.type === 'workspace') {
    const count = await repo.countCanvasesByOwner(db, 'workspace', owner.workspaceId);
    if (count >= limits.maxCanvasesPerWorkspace) {
      throw new LimitError(
        `canvas limit reached (${limits.maxCanvasesPerWorkspace} per workspace)`,
        'maxCanvasesPerWorkspace',
      );
    }
  }
  return repo.insertCanvas(db, { name, owner, snapshot: { nodes: [], edges: [], viewport: null }, createdById });
}

/*
 * Canvas *content* is edited collaboratively through a room (see `room.ts`),
 * never via a REST write. Hosts use these two calls to hydrate a room when it
 * opens and to flush it back.
 */
export function loadCanvasDoc(db: Db, id: string): Promise<Y.Doc | null> {
  return repo.loadCanvasDoc(db, id);
}

export function saveCanvasDoc(db: Db, id: string, doc: Y.Doc): Promise<boolean> {
  return repo.saveCanvasDoc(db, id, doc);
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
