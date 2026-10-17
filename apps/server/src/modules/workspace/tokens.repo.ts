import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { identityColor, type WorkspaceToken } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { workspaceTokens, workspaces } from '../../db/schema.js';

type TokenRow = typeof workspaceTokens.$inferSelect;

function metadata(row: TokenRow): WorkspaceToken {
  const id = `agent:${row.id}`;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identity: { id, name: row.name, color: identityColor(id), kind: 'agent' },
    prefix: row.prefix,
    role: row.role === 'editor' ? 'editor' : 'viewer',
    createdById: row.createdById,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export async function insertToken(db: Db, row: TokenRow): Promise<WorkspaceToken> {
  await db.insert(workspaceTokens).values(row).run();
  return metadata(row);
}

export async function listTokens(db: Db, workspaceId: string): Promise<WorkspaceToken[]> {
  const rows = await db.select().from(workspaceTokens)
    .where(eq(workspaceTokens.workspaceId, workspaceId))
    .orderBy(desc(workspaceTokens.createdAt)).all();
  return rows.map(metadata);
}

/** A deleted workspace, revoked token or expired token is never an identity. */
export async function getActiveToken(
  db: Db,
  lookup: { id: string } | { hash: string },
): Promise<WorkspaceToken | null> {
  const row = await db.select({ token: workspaceTokens }).from(workspaceTokens)
    .innerJoin(workspaces, eq(workspaces.id, workspaceTokens.workspaceId))
    .where(and(
      'id' in lookup ? eq(workspaceTokens.id, lookup.id) : eq(workspaceTokens.tokenHash, lookup.hash),
      isNull(workspaceTokens.revokedAt),
      gt(workspaceTokens.expiresAt, Date.now()),
    )).get();
  return row ? metadata(row.token) : null;
}

export async function revokeToken(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db.update(workspaceTokens).set({ revokedAt: Date.now() })
    .where(and(eq(workspaceTokens.workspaceId, workspaceId), eq(workspaceTokens.id, id)))
    .returning({ id: workspaceTokens.id }).all();
  return rows.length > 0;
}
