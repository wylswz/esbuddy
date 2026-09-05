import { eq, and, desc, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { docToSnapshot, snapshotToDoc } from '@esbuddy/sdk';
import type { CanvasMeta, CanvasOwner, CanvasRecord, CanvasSnapshot } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { canvases, canvasEvents } from '../../db/schema.js';
import { base64ToBytes, bytesToBase64 } from './codec.js';

const now = () => Date.now();

function rowToCanvasMeta(r: typeof canvases.$inferSelect): CanvasMeta {
  const owner: CanvasOwner =
    r.ownerType === 'workspace'
      ? { type: 'workspace', workspaceId: r.ownerId }
      : { type: 'user', userId: r.ownerId };
  return {
    id: r.id,
    name: r.name,
    owner,
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

export async function listCanvases(db: Db, userId: string, workspaceId?: string): Promise<CanvasMeta[]> {
  const rows = workspaceId
    ? await db
        .select()
        .from(canvases)
        .where(and(eq(canvases.ownerType, 'workspace'), eq(canvases.ownerId, workspaceId)))
        .all()
    : await db.select().from(canvases).where(and(eq(canvases.ownerType, 'user'), eq(canvases.ownerId, userId))).all();
  return rows.map(rowToCanvasMeta);
}

export async function getCanvas(db: Db, id: string): Promise<CanvasRecord | null> {
  const r = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  if (!r) return null;
  const snapshot = JSON.parse(r.snapshot) as CanvasSnapshot;
  return { ...rowToCanvasMeta(r), snapshot };
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
    if (snapshot.nodes?.length || snapshot.edges?.length) {
      snapshotToDoc({ nodes: snapshot.nodes ?? [], edges: snapshot.edges ?? [], viewport: null }, doc);
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

export async function deleteCanvas(db: Db, id: string): Promise<void> {
  await db.delete(canvasEvents).where(eq(canvasEvents.canvasId, id)).run();
  await db.delete(canvases).where(eq(canvases.id, id)).run();
}

export async function listEvents(db: Db, canvasId: string, afterSeq?: number): Promise<{ seq: number; type: string; payload: unknown; actorId: string | null; createdAt: number }[]> {
  const rows = await db
    .select()
    .from(canvasEvents)
    .where(eq(canvasEvents.canvasId, canvasId))
    .orderBy(desc(canvasEvents.seq))
    .all();
  return rows
    .filter((r) => afterSeq === undefined || r.seq > afterSeq)
    .map((r) => ({ seq: r.seq, type: r.type, payload: JSON.parse(r.payload), actorId: r.actorId, createdAt: r.createdAt }));
}
