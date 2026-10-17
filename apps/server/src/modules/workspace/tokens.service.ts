import type { CreatedWorkspaceToken, WorkspaceToken } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import * as repo from './tokens.repo.js';

export const WORKSPACE_TOKEN_PREFIX = 'esb_';
const DAY = 86_400_000;

export class TokenInputError extends Error {}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

export async function createWorkspaceToken(
  db: Db,
  workspaceId: string,
  createdById: string,
  input: unknown,
): Promise<CreatedWorkspaceToken> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TokenInputError('invalid token input');
  const { name, role = 'editor', expiresAt = Date.now() + 90 * DAY } = input as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80
    || Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new TokenInputError('identity name must be 1-80 characters without control characters');
  }
  if (role !== 'editor' && role !== 'viewer') throw new TokenInputError('role must be editor or viewer');
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now() || expiresAt > Date.now() + 366 * DAY) {
    throw new TokenInputError('expiresAt must be a future timestamp within 366 days');
  }
  const token = WORKSPACE_TOKEN_PREFIX + hex(crypto.getRandomValues(new Uint8Array(32)));
  const result = await repo.insertToken(db, {
    id: crypto.randomUUID(),
    workspaceId,
    name: name.trim(),
    role,
    tokenHash: await hashToken(token),
    prefix: token.slice(0, 12),
    createdById,
    createdAt: Date.now(),
    expiresAt,
    revokedAt: null,
  });
  return { ...result, token };
}

export function listWorkspaceTokens(db: Db, workspaceId: string): Promise<WorkspaceToken[]> {
  return repo.listTokens(db, workspaceId);
}

export function revokeWorkspaceToken(db: Db, workspaceId: string, id: string): Promise<boolean> {
  return repo.revokeToken(db, workspaceId, id);
}

export async function authenticateWorkspaceToken(db: Db, token: string): Promise<WorkspaceToken | null> {
  if (!/^esb_[0-9a-f]{64}$/.test(token)) return null;
  return repo.getActiveToken(db, { hash: await hashToken(token) });
}

/** Rechecked on every socket message, not just on the initial handshake. */
export function getActiveWorkspaceToken(db: Db, id: string): Promise<WorkspaceToken | null> {
  return repo.getActiveToken(db, { id });
}
