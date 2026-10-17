import type { CanvasOwner, Role, WorkspaceToken } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { getCanvasOwner } from '../canvas/service.js';
import { getMemberRole } from '../workspace/service.js';

/*
 * Authorization: who may read or write what. Sits above the workspace and
 * canvas modules (it needs both), so neither depends on the other for it.
 *
 *   user-owned canvas       → its owner only (write)
 *   workspace-owned canvas  → workspace members; owners/editors write, viewers read
 *
 * `null` means no access at all; callers answer 404 so the API never reveals
 * whether something they can't see exists.
 */

export type Access = 'read' | 'write';
export type AccessSubject = string | WorkspaceToken;

function roleAccess(role: Role | null): Access | null {
  if (!role) return null;
  return role === 'viewer' ? 'read' : 'write';
}

export async function workspaceAccess(db: Db, workspaceId: string, subject: AccessSubject): Promise<Access | null> {
  if (typeof subject !== 'string') {
    return subject.workspaceId === workspaceId ? roleAccess(subject.role) : null;
  }
  return roleAccess(await getMemberRole(db, workspaceId, subject));
}

/** Access to whatever `owner` designates (also used when creating a canvas there). */
export function ownerAccess(db: Db, owner: CanvasOwner, subject: AccessSubject): Promise<Access | null> {
  if (owner.type === 'workspace') return workspaceAccess(db, owner.workspaceId, subject);
  return Promise.resolve(typeof subject === 'string' && owner.userId === subject ? 'write' : null);
}

export async function canvasAccess(db: Db, canvasId: string, subject: AccessSubject): Promise<Access | null> {
  const owner = await getCanvasOwner(db, canvasId);
  return owner ? ownerAccess(db, owner, subject) : null;
}
