import { eq, and, max, desc, inArray } from 'drizzle-orm';
import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  CanvasSnapshot,
  Invitation,
  Role,
  User,
  Workspace,
  WorkspaceMember,
} from '@esbuddy/sdk';
import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot } from '@esbuddy/sdk';
import type { Db } from './db/index.js';
import { canvases, canvasEvents, invitations, users, workspaceMembers, workspaces } from './db/schema.js';

const now = () => Date.now();

function rowToUser(r: typeof users.$inferSelect): User {
  return { id: r.id, name: r.name, email: r.email, avatarUrl: r.avatarUrl, provider: r.provider, createdAt: r.createdAt };
}

function rowToWorkspace(r: typeof workspaces.$inferSelect): Workspace {
  return { id: r.id, name: r.name, ownerId: r.ownerId, createdAt: r.createdAt };
}

function rowToMember(r: typeof workspaceMembers.$inferSelect): WorkspaceMember {
  return { workspaceId: r.workspaceId, userId: r.userId, role: r.role as Role, joinedAt: r.joinedAt };
}

function rowToInvitation(r: typeof invitations.$inferSelect): Invitation {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    role: r.role as Role,
    token: r.token,
    createdById: r.createdById,
    createdAt: r.createdAt,
    revokedAt: r.revokedAt,
  };
}

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

// ---- users ----

export async function upsertGoogleUser(
  db: Db,
  input: { googleSub: string; email: string; name: string; avatarUrl?: string | null },
): Promise<User> {
  const existing = await db.select().from(users).where(eq(users.googleSub, input.googleSub)).get();
  if (existing) return rowToUser(existing);

  const row = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    avatarUrl: input.avatarUrl ?? null,
    provider: 'google',
    googleSub: input.googleSub,
    createdAt: now(),
  };
  await db.insert(users).values(row).run();

  // Every new user gets a personal workspace so they always have a place to work.
  await createWorkspace(db, defaultWorkspaceName(row.name), row.id);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    provider: row.provider,
    createdAt: row.createdAt,
  };
}

function defaultWorkspaceName(userName: string): string {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s Workspace` : 'My Workspace';
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const r = await db.select().from(users).where(eq(users.id, id)).get();
  return r ? rowToUser(r) : null;
}

// ---- workspaces ----

export async function listWorkspacesForUser(db: Db, userId: string): Promise<Workspace[]> {
  const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).all();
  if (members.length === 0) return [];
  const rows = await db
    .select()
    .from(workspaces)
    .where(inArray(workspaces.id, members.map((m) => m.workspaceId)))
    .all();
  return rows.map(rowToWorkspace);
}

/**
 * Guarantee the user belongs to at least one workspace, creating a personal one
 * if needed. Keeps the "every user has a workspace" invariant for accounts that
 * predate that rule. Returns the user's full workspace list.
 */
export async function ensureUserHasWorkspace(db: Db, userId: string, userName?: string): Promise<Workspace[]> {
  const existing = await listWorkspacesForUser(db, userId);
  if (existing.length > 0) return existing;
  const created = await createWorkspace(db, defaultWorkspaceName(userName ?? ''), userId);
  return [created];
}

export async function createWorkspace(db: Db, name: string, ownerId: string): Promise<Workspace> {
  const id = crypto.randomUUID();
  const createdAt = now();
  await db.insert(workspaces).values({ id, name, ownerId, createdAt }).run();
  await db.insert(workspaceMembers).values({ workspaceId: id, userId: ownerId, role: 'owner', joinedAt: createdAt }).run();

  // Seed a worked DDD example so the workspace is never empty on first visit.
  await db
    .insert(canvases)
    .values({
      id: crypto.randomUUID(),
      name: EXAMPLE_CANVAS_NAME,
      ownerType: 'workspace',
      ownerId: id,
      snapshot: JSON.stringify(exampleCanvasSnapshot()),
      version: 0,
      createdById: ownerId,
      createdAt,
      updatedAt: createdAt,
    })
    .run();

  return { id, name, ownerId, createdAt };
}

export async function getWorkspace(db: Db, id: string): Promise<Workspace | null> {
  const r = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  return r ? rowToWorkspace(r) : null;
}

export async function listMembers(db: Db, workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).all();
  return rows.map(rowToMember);
}

export async function isMember(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const r = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  return !!r;
}

export async function getMemberRole(db: Db, workspaceId: string, userId: string): Promise<Role | null> {
  const r = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  return r ? (r.role as Role) : null;
}

// ---- invitations ----

export async function createInvitation(
  db: Db,
  workspaceId: string,
  role: Role,
  createdById: string,
): Promise<Invitation> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const createdAt = now();
  await db.insert(invitations).values({ id, workspaceId, role, token, createdById, createdAt }).run();
  return { id, workspaceId, role, token, createdById, createdAt, revokedAt: null };
}

export async function getInvitationByToken(db: Db, token: string): Promise<Invitation | null> {
  const r = await db.select().from(invitations).where(eq(invitations.token, token)).get();
  return r ? rowToInvitation(r) : null;
}

export async function acceptInvitation(db: Db, token: string, userId: string): Promise<Workspace | null> {
  const inv = await getInvitationByToken(db, token);
  if (!inv || inv.revokedAt) return null;
  const existing = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, inv.workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  if (!existing) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: inv.workspaceId, userId, role: inv.role, joinedAt: now() })
      .run();
  }
  return getWorkspace(db, inv.workspaceId);
}

// ---- canvases ----

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

export async function createCanvas(
  db: Db,
  name: string,
  owner: CanvasOwner,
  createdById: string,
): Promise<CanvasMeta> {
  const id = crypto.randomUUID();
  const { ownerType, ownerId } = ownerToColumns(owner);
  const createdAt = now();
  await db
    .insert(canvases)
    .values({ id, name, ownerType, ownerId, snapshot: JSON.stringify({ nodes: [], edges: [], viewport: null }), version: 0, createdById, createdAt, updatedAt: createdAt })
    .run();
  return { id, name, owner, version: 0, createdAt, updatedAt: createdAt };
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
