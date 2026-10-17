import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Shared schema for all SQLite-family drivers (node:sqlite locally, D1 on CF).
// Postgres would be a separate pg-core schema (ADR-0001.3).

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  avatarUrl: text('avatar_url'),
  provider: text('provider').notNull().default('google'),
  googleSub: text('google_sub'),
  createdAt: integer('created_at').notNull(),
});

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('editor'),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const workspaceTokens = sqliteTable(
  'workspace_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    role: text('role').notNull(),
    createdById: text('created_by_id').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('workspace_tokens_workspace_id_idx').on(t.workspaceId, t.createdAt)],
);

export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerType: text('owner_type').notNull(), // 'user' | 'workspace'
  ownerId: text('owner_id').notNull(),
  // Materialised JSON view of the canvas (gallery thumbnails, REST reads).
  // Derived from `ydoc` on every flush; also the seed for canvases that
  // predate the CRDT (their room converts it on first open).
  snapshot: text('snapshot').notNull().default('{}'),
  // Source of truth: the Yjs document state as a base64 update. Text rather
  // than blob so the same column round-trips through better-sqlite3 and D1.
  ydoc: text('ydoc'),
  version: integer('version').notNull().default(0),
  createdById: text('created_by_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Legacy: the pre-CRDT event log (ADR-0001.7). Nothing reads or writes it any
// more (content syncs through Yjs, ADR-0002); rows are only cleaned up on
// canvas deletion until the table is dropped.
export const canvasEvents = sqliteTable(
  'canvas_events',
  {
    canvasId: text('canvas_id').notNull(),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull().default('null'),
    actorId: text('actor_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.canvasId, t.seq] })],
);

// Published, immutable snapshots of a canvas. `id` is a random hex signature
// (like a commit id) that doubles as the unguessable permalink token; the
// permalink only resolves while `is_public` is on.
export const canvasVersions = sqliteTable(
  'canvas_versions',
  {
    id: text('id').primaryKey(),
    canvasId: text('canvas_id').notNull(),
    canvasName: text('canvas_name').notNull(),
    description: text('description').notNull().default(''),
    snapshot: text('snapshot').notNull(),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    createdById: text('created_by_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('canvas_versions_canvas_id_idx').on(t.canvasId, t.createdAt)],
);

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  role: text('role').notNull().default('editor'),
  token: text('token').notNull(),
  createdById: text('created_by_id').notNull(),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at'),
});

export type UserRow = typeof users.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MemberRow = typeof workspaceMembers.$inferSelect;
export type CanvasRow = typeof canvases.$inferSelect;
export type CanvasVersionRow = typeof canvasVersions.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;

export const schema = {
  users,
  workspaces,
  workspaceMembers,
  workspaceTokens,
  canvases,
  canvasEvents,
  canvasVersions,
  invitations,
  sql,
};
