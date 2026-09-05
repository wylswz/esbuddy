import { eq, and, max, desc } from 'drizzle-orm';
import type { CanvasMeta, CanvasOwner, CanvasRecord, CanvasSnapshot } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { canvases, canvasEvents } from '../../db/schema.js';

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

export async function saveCanvas(
  db: Db,
  id: string,
  snapshot: CanvasSnapshot,
  name?: string,
  actorId?: string,
): Promise<CanvasMeta | null> {
  const existing = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  if (!existing) return null;

  const seq = await nextSeq(db, id);
  const updatedAt = now();
  await db
    .update(canvases)
    .set({
      ...(name ? { name } : {}),
      snapshot: JSON.stringify(snapshot),
      version: existing.version + 1,
      updatedAt,
    })
    .where(eq(canvases.id, id))
    .run();

  await db
    .insert(canvasEvents)
    .values({ canvasId: id, seq, type: 'set_state', payload: JSON.stringify(snapshot), actorId: actorId ?? null, createdAt: updatedAt })
    .run();

  const updated = await db.select().from(canvases).where(eq(canvases.id, id)).get();
  return updated ? rowToCanvasMeta(updated) : null;
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

async function nextSeq(db: Db, canvasId: string): Promise<number> {
  const r = await db
    .select({ value: max(canvasEvents.seq) })
    .from(canvasEvents)
    .where(eq(canvasEvents.canvasId, canvasId))
    .get();
  return (r?.value ?? 0) + 1;
}
