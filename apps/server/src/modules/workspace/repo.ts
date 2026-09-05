import { eq, and, inArray } from 'drizzle-orm';
import type { Invitation, Role, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { invitations, workspaceMembers, workspaces } from '../../db/schema.js';

const now = () => Date.now();

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

/** Insert the workspace row plus its owner membership. */
export async function insertWorkspace(db: Db, name: string, ownerId: string): Promise<Workspace> {
  const id = crypto.randomUUID();
  const createdAt = now();
  await db.insert(workspaces).values({ id, name, ownerId, createdAt }).run();
  await db.insert(workspaceMembers).values({ workspaceId: id, userId: ownerId, role: 'owner', joinedAt: createdAt }).run();
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

/** Add a membership only if the user is not already a member. */
export async function addMemberIfAbsent(db: Db, workspaceId: string, userId: string, role: Role): Promise<void> {
  const existing = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  if (!existing) {
    await db.insert(workspaceMembers).values({ workspaceId, userId, role, joinedAt: now() }).run();
  }
}

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
