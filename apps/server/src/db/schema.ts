import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
export type EventRow = typeof canvasEvents.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;

export const schema = {
  users,
  workspaces,
  workspaceMembers,
  canvases,
  canvasEvents,
  invitations,
  sql,
};
