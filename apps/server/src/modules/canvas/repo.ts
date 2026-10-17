import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { docToSnapshot, snapshotToDoc } from '@esbuddy/sdk';
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
import { canvases, canvasEvents, canvasVersions } from '../../db/schema.js';
import { base64ToBytes, bytesToBase64 } from './codec.js';

const now = () => Date.now();

function columnsToOwner(r: { ownerType: string; ownerId: string }): CanvasOwner {
  return r.ownerType === 'workspace' ? { type: 'workspace', workspaceId: r.ownerId } : { type: 'user', userId: r.ownerId };
}

function rowToCanvasMeta(r: typeof canvases.$inferSelect): CanvasMeta {
  return {
    id: r.id,
    name: r.name,
    owner: columnsToOwner(r),
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function ownerToColumns(owner: CanvasOwner): { ownerType: string; ownerId: string } {
  return owner.type === 'workspace'
    ? { ownerType: 'workspace', ownerId: owner.workspaceId }
    : { ownerType: 'user', ownerId: owner.userId };
}

function ownedBy(owner: CanvasOwner) {
  const { ownerType, ownerId } = ownerToColumns(owner);
  return and(eq(canvases.ownerType, ownerType), eq(canvases.ownerId, ownerId));
}

export async function listCanvases(db: Db, owner: CanvasOwner): Promise<CanvasMeta[]> {
  const rows = await db.select().from(canvases).where(ownedBy(owner)).all();
  return rows.map(rowToCanvasMeta);
}

export async function getCanvas(db: Db, id: string): Promise<CanvasRecord | null> {
  const r = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  if (!r) return null;
  const snapshot = JSON.parse(r.snapshot) as CanvasSnapshot;
  return { ...rowToCanvasMeta(r), snapshot };
}

/** Who owns a canvas, or null if it doesn't exist. */
export async function getCanvasOwner(db: Db, id: string): Promise<CanvasOwner | null> {
  const r = await db
    .select({ ownerType: canvases.ownerType, ownerId: canvases.ownerId })
    .from(canvases)
    .where(eq(canvases.id, id))
    .get();
  return r ? columnsToOwner(r) : null;
}

/** Low-level insert with a full snapshot; used by both create and seeding. */
export async function insertCanvas(
  db: Db,
  input: { name: string; owner: CanvasOwner; snapshot: CanvasSnapshot; createdById: string },
): Promise<CanvasMeta> {
  const id = crypto.randomUUID();
  const { ownerType, ownerId } = ownerToColumns(input.owner);
  const createdAt = now();
  await db
    .insert(canvases)
    .values({
      id,
      name: input.name,
      ownerType,
      ownerId,
      snapshot: JSON.stringify(input.snapshot),
      version: 0,
      createdById: input.createdById,
      createdAt,
      updatedAt: createdAt,
    })
    .run();
  return { id, name: input.name, owner: input.owner, version: 0, createdAt, updatedAt: createdAt };
}

/**
 * Load the canvas as a Y.Doc for a collaboration room. Prefers the stored CRDT
 * state; a canvas that predates it (or was just created/seeded, which only
 * writes `snapshot`) is converted from its JSON snapshot on first open.
 * Returns null when the canvas does not exist.
 */
export async function loadCanvasDoc(db: Db, id: string): Promise<Y.Doc | null> {
  const r = await db
    .select({ ydoc: canvases.ydoc, snapshot: canvases.snapshot })
    .from(canvases)
    .where(eq(canvases.id, id))
    .get();
  if (!r) return null;

  const doc = new Y.Doc();
  if (r.ydoc) {
    Y.applyUpdate(doc, base64ToBytes(r.ydoc));
  } else {
    const snapshot = JSON.parse(r.snapshot) as Partial<CanvasSnapshot>;
    if (snapshot.nodes?.length || snapshot.edges?.length || snapshot.structure) {
      snapshotToDoc(
        { nodes: snapshot.nodes ?? [], edges: snapshot.edges ?? [], viewport: null, structure: snapshot.structure },
        doc,
      );
    }
  }
  return doc;
}

/**
 * Persist a room's doc: the CRDT state (source of truth) plus the materialised
 * JSON snapshot that gallery thumbnails and REST reads consume.
 */
export async function saveCanvasDoc(db: Db, id: string, doc: Y.Doc): Promise<boolean> {
  const result = await db
    .update(canvases)
    .set({
      ydoc: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      snapshot: JSON.stringify(docToSnapshot(doc)),
      version: sql`${canvases.version} + 1`,
      updatedAt: now(),
    })
    .where(eq(canvases.id, id))
    .run();
  // better-sqlite3 reports `changes`; D1 reports `meta.changes`.
  const r = result as unknown as { changes?: number; meta?: { changes?: number } };
  return (r.changes ?? r.meta?.changes ?? 0) > 0;
}

export async function renameCanvas(db: Db, id: string, name: string): Promise<CanvasMeta | null> {
  const existing = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  if (!existing) return null;
  const updatedAt = now();
  await db.update(canvases).set({ name, updatedAt }).where(eq(canvases.id, id)).run();
  const updated = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  return updated ? rowToCanvasMeta(updated) : null;
}

/** Delete canvases with everything hanging off them (events, published versions). */
export async function deleteCanvases(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(canvasEvents).where(inArray(canvasEvents.canvasId, ids)).run();
  await db.delete(canvasVersions).where(inArray(canvasVersions.canvasId, ids)).run();
  await db.delete(canvases).where(inArray(canvases.id, ids)).run();
}

export async function listCanvasIdsByOwner(db: Db, owner: CanvasOwner): Promise<string[]> {
  const rows = await db.select({ id: canvases.id }).from(canvases).where(ownedBy(owner)).all();
  return rows.map((r) => r.id);
}

// ---------- published versions ----------

function rowToVersionMeta(r: typeof canvasVersions.$inferSelect): CanvasVersionMeta {
  return {
    id: r.id,
    canvasId: r.canvasId,
    canvasName: r.canvasName,
    description: r.description,
    isPublic: r.isPublic,
    createdById: r.createdById,
    createdAt: r.createdAt,
  };
}

/** Name of a canvas, or null if it doesn't exist. */
export async function getCanvasName(db: Db, id: string): Promise<string | null> {
  const r = await db.select({ name: canvases.name }).from(canvases).where(eq(canvases.id, id)).get();
  return r?.name ?? null;
}

export async function insertVersion(
  db: Db,
  input: {
    id: string;
    canvasId: string;
    canvasName: string;
    description: string;
    isPublic: boolean;
    snapshot: string;
    createdById: string;
  },
): Promise<CanvasVersionMeta> {
  const row = { ...input, createdAt: now() };
  await db.insert(canvasVersions).values(row).run();
  return rowToVersionMeta(row);
}

/** Versions of a canvas, newest first. */
export async function listVersions(db: Db, canvasId: string): Promise<CanvasVersionMeta[]> {
  const rows = await db
    .select()
    .from(canvasVersions)
    .where(eq(canvasVersions.canvasId, canvasId))
    .orderBy(desc(canvasVersions.createdAt))
    .all();
  return rows.map(rowToVersionMeta);
}

export async function getVersion(db: Db, canvasId: string, id: string): Promise<CanvasVersion | null> {
  const r = await db
    .select()
    .from(canvasVersions)
    .where(and(eq(canvasVersions.id, id), eq(canvasVersions.canvasId, canvasId)))
    .get();
  return r ? { ...rowToVersionMeta(r), snapshot: JSON.parse(r.snapshot) as CanvasSnapshot } : null;
}

/** Resolve a permalink; private versions resolve to null, same as missing ones. */
export async function getPublishedVersion(db: Db, id: string): Promise<PublishedCanvasVersion | null> {
  const r = await db
    .select()
    .from(canvasVersions)
    .where(and(eq(canvasVersions.id, id), eq(canvasVersions.isPublic, true)))
    .get();
  if (!r) return null;
  return {
    id: r.id,
    canvasName: r.canvasName,
    description: r.description,
    createdAt: r.createdAt,
    snapshot: JSON.parse(r.snapshot) as CanvasSnapshot,
  };
}

export async function updateVersion(
  db: Db,
  canvasId: string,
  id: string,
  patch: { description?: string; isPublic?: boolean },
): Promise<CanvasVersionMeta | null> {
  const where = and(eq(canvasVersions.id, id), eq(canvasVersions.canvasId, canvasId));
  await db.update(canvasVersions).set(patch).where(where).run();
  const r = await db.select().from(canvasVersions).where(where).get();
  return r ? rowToVersionMeta(r) : null;
}

export async function deleteVersion(db: Db, canvasId: string, id: string): Promise<void> {
  await db
    .delete(canvasVersions)
    .where(and(eq(canvasVersions.id, id), eq(canvasVersions.canvasId, canvasId)))
    .run();
}

/** Number of canvases owned by a workspace or user. */
export async function countCanvasesByOwner(db: Db, owner: CanvasOwner): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(canvases).where(ownedBy(owner)).all();
  return rows[0]?.count ?? 0;
}
