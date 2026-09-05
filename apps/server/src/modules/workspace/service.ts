import type { Invitation, InvitationPreview, Role, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { LimitError, type Limits } from '../../limits.js';
import { seedExampleCanvas } from '../canvas/service.js';
import * as repo from './repo.js';

function defaultWorkspaceName(userName: string): string {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s Workspace` : 'My Workspace';
}

export function listWorkspacesForUser(db: Db, userId: string): Promise<Workspace[]> {
  return repo.listWorkspacesForUser(db, userId);
}

export function listMembers(db: Db, workspaceId: string): Promise<WorkspaceMember[]> {
  return repo.listMembers(db, workspaceId);
}

/**
 * Create a workspace with its owner membership and seed a worked example canvas
 * so it is never empty on first visit. When `limits` is provided, enforces the
 * max-workspaces-per-user cap; pass `undefined` for internal calls (e.g.
 * `ensureUserHasWorkspace`) that must bypass it.
 */
export async function createWorkspace(
  db: Db,
  name: string,
  ownerId: string,
  limits?: Limits,
): Promise<Workspace> {
  if (limits?.maxWorkspacesPerUser !== undefined) {
    const count = await repo.countWorkspacesForUser(db, ownerId);
    if (count >= limits.maxWorkspacesPerUser) {
      throw new LimitError(
        `workspace limit reached (${limits.maxWorkspacesPerUser} per user)`,
        'maxWorkspacesPerUser',
      );
    }
  }
  const workspace = await repo.insertWorkspace(db, name, ownerId);
  await seedExampleCanvas(db, workspace.id, ownerId);
  return workspace;
}

/** Create a personal workspace for a user who has none (used on sign-up). */
export function createPersonalWorkspace(db: Db, userName: string, ownerId: string): Promise<Workspace> {
  return createWorkspace(db, defaultWorkspaceName(userName), ownerId);
}

/**
 * Guarantee the user belongs to at least one workspace, creating a personal one
 * if needed. Keeps the "every user has a workspace" invariant for accounts that
 * predate that rule. Returns the user's full workspace list.
 */
export async function ensureUserHasWorkspace(db: Db, userId: string, userName?: string): Promise<Workspace[]> {
  const existing = await repo.listWorkspacesForUser(db, userId);
  if (existing.length > 0) return existing;
  const created = await createWorkspace(db, defaultWorkspaceName(userName ?? ''), userId);
  return [created];
}

/** Owner-only: create a share invitation for a workspace. */
export async function inviteToWorkspace(
  db: Db,
  workspaceId: string,
  actorId: string,
  role: Role,
): Promise<Invitation | null> {
  const actorRole = await repo.getMemberRole(db, workspaceId, actorId);
  if (actorRole !== 'owner') return null;
  return repo.createInvitation(db, workspaceId, role, actorId);
}

/**
 * Resolve a share token to a safe preview (workspace name + role) so the
 * recipient can confirm before joining. Returns `{ valid: false }` for unknown
 * or revoked tokens rather than leaking whether a token exists.
 */
export async function previewInvitation(db: Db, token: string): Promise<InvitationPreview> {
  const inv = await repo.getInvitationByToken(db, token);
  if (!inv || inv.revokedAt) return { valid: false };
  const workspace = await repo.getWorkspace(db, inv.workspaceId);
  if (!workspace) return { valid: false };
  return { valid: true, workspaceId: workspace.id, workspaceName: workspace.name, role: inv.role };
}

/** Join a workspace via a share link (ADR-0001.5). Enforces the member cap. */
export async function acceptInvitation(
  db: Db,
  token: string,
  userId: string,
  limits?: Limits,
): Promise<Workspace | null> {
  const inv = await repo.getInvitationByToken(db, token);
  if (!inv || inv.revokedAt) return null;
  // Only count towards the limit if the user is not already a member.
  const alreadyMember = await repo.isMember(db, inv.workspaceId, userId);
  if (!alreadyMember && limits?.maxMembersPerWorkspace !== undefined) {
    const count = await repo.countMembers(db, inv.workspaceId);
    if (count >= limits.maxMembersPerWorkspace) {
      throw new LimitError(
        `member limit reached (${limits.maxMembersPerWorkspace} per workspace)`,
        'maxMembersPerWorkspace',
      );
    }
  }
  await repo.addMemberIfAbsent(db, inv.workspaceId, userId, inv.role);
  return repo.getWorkspace(db, inv.workspaceId);
}

/**
 * Owner-only: cascade-delete a workspace — all its canvases (and their events),
 * invitations, and memberships. Returns `true` on success, `false` if the
 * workspace doesn't exist or the actor is not the owner.
 */
export async function deleteWorkspace(db: Db, workspaceId: string, actorId: string): Promise<boolean> {
  const workspace = await repo.getWorkspace(db, workspaceId);
  if (!workspace) return false;
  if (workspace.ownerId !== actorId) return false;
  await repo.deleteWorkspace(db, workspaceId);
  return true;
}
