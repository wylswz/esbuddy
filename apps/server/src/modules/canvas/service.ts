import type * as Y from 'yjs';
import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot } from '@esbuddy/sdk';
import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  CanvasSnapshot,
  CanvasVersion,
  CanvasVersionMeta,
  PublishedCanvasVersion,
} from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { LimitError, type Limits } from '../../limits.js';
import * as repo from './repo.js';

export function listCanvases(db: Db, owner: CanvasOwner): Promise<CanvasMeta[]> {
  return repo.listCanvases(db, owner);
}

export function getCanvas(db: Db, id: string): Promise<CanvasRecord | null> {
  return repo.getCanvas(db, id);
}

export function getCanvasOwner(db: Db, id: string): Promise<CanvasOwner | null> {
  return repo.getCanvasOwner(db, id);
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
    const count = await repo.countCanvasesByOwner(db, owner);
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
  return repo.deleteCanvases(db, [id]);
}

/** Delete every canvas a workspace owns (part of the workspace cascade). */
export async function deleteWorkspaceCanvases(db: Db, workspaceId: string): Promise<void> {
  await repo.deleteCanvases(db, await repo.listCanvasIdsByOwner(db, { type: 'workspace', workspaceId }));
}

// ---------- published versions ----------

export const MAX_VERSION_DESCRIPTION_LENGTH = 2000;
/** Stays well under D1's 2 MB row limit. */
export const MAX_VERSION_SNAPSHOT_BYTES = 1_000_000;

/** Invalid publish/edit input; the API layer maps `status` to the response. */
export class VersionInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'VersionInputError';
  }
}

/** A random 160-bit hex signature, shaped like a git commit id. */
function newVersionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseDescription(raw: unknown): string {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    throw new VersionInputError('description must be a string', 400);
  }
  const description = (raw ?? '').trim();
  if (description.length > MAX_VERSION_DESCRIPTION_LENGTH) {
    throw new VersionInputError(`description exceeds ${MAX_VERSION_DESCRIPTION_LENGTH} characters`, 400);
  }
  return description;
}

function parseIsPublic(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') throw new VersionInputError('isPublic must be a boolean', 400);
  return raw;
}

export function listVersions(db: Db, canvasId: string): Promise<CanvasVersionMeta[]> {
  return repo.listVersions(db, canvasId);
}

export function getVersion(db: Db, canvasId: string, versionId: string): Promise<CanvasVersion | null> {
  return repo.getVersion(db, canvasId, versionId);
}

/**
 * Freeze a canvas's content as a new version. The snapshot comes from the
 * publishing client's synced Y.Doc rather than the DB: the stored `snapshot`
 * column lags the live room (debounced flush; DO storage on Cloudflare), so
 * the client's copy is what the user actually sees when clicking Publish.
 * Versions are private unless `isPublic` is set: no permalink resolves until
 * public access is switched on. Returns null when the canvas does not exist.
 */
export async function publishVersion(
  db: Db,
  canvasId: string,
  input: { description?: unknown; isPublic?: unknown; snapshot?: unknown },
  actorId: string,
): Promise<CanvasVersionMeta | null> {
  const description = parseDescription(input.description);
  const isPublic = parseIsPublic(input.isPublic) ?? false;
  const s = input.snapshot as Partial<CanvasSnapshot> | null | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) {
    throw new VersionInputError('snapshot with nodes and edges required', 400);
  }
  const st = s.structure;
  const structure =
    st && typeof st === 'object' && Array.isArray(st.lanes) && Array.isArray(st.milestones)
      ? { lanes: st.lanes, milestones: st.milestones }
      : undefined;
  const snapshot = JSON.stringify({ nodes: s.nodes, edges: s.edges, viewport: null, structure });
  if (new TextEncoder().encode(snapshot).length > MAX_VERSION_SNAPSHOT_BYTES) {
    throw new VersionInputError('snapshot too large', 413);
  }
  const canvasName = await repo.getCanvasName(db, canvasId);
  if (canvasName === null) return null;
  return repo.insertVersion(db, {
    id: newVersionId(),
    canvasId,
    canvasName,
    description,
    isPublic,
    snapshot,
    createdById: actorId,
  });
}

/** Only the description and public-access switch are mutable; content stays frozen. */
export function updateVersion(
  db: Db,
  canvasId: string,
  versionId: string,
  input: { description?: unknown; isPublic?: unknown },
): Promise<CanvasVersionMeta | null> {
  const patch: { description?: string; isPublic?: boolean } = {};
  if (input.description !== undefined) patch.description = parseDescription(input.description);
  const isPublic = parseIsPublic(input.isPublic);
  if (isPublic !== undefined) patch.isPublic = isPublic;
  if (Object.keys(patch).length === 0) throw new VersionInputError('nothing to update', 400);
  return repo.updateVersion(db, canvasId, versionId, patch);
}

export function deleteVersion(db: Db, canvasId: string, versionId: string): Promise<void> {
  return repo.deleteVersion(db, canvasId, versionId);
}

export function getPublishedVersion(db: Db, versionId: string): Promise<PublishedCanvasVersion | null> {
  return repo.getPublishedVersion(db, versionId);
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
