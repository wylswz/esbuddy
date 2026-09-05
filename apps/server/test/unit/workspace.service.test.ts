import { beforeEach, describe, expect, it } from 'vitest';
import * as canvas from '../../src/modules/canvas/service.js';
import * as workspace from '../../src/modules/workspace/service.js';
import type { Db } from '../../src/db/types.js';
import { createTestDb } from '../helpers/db.js';

describe('workspace service', () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a workspace with an owner membership and a seeded example canvas', async () => {
    const ws = await workspace.createWorkspace(db, 'Team', 'u1');
    const members = await workspace.listMembers(db, ws.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: 'u1', role: 'owner' });

    const canvases = await canvas.listCanvases(db, 'u1', ws.id);
    expect(canvases).toHaveLength(1);
  });

  it('ensureUserHasWorkspace creates one only when none exist', async () => {
    const first = await workspace.ensureUserHasWorkspace(db, 'u1', 'Alice');
    expect(first).toHaveLength(1);
    expect(first[0].name).toBe("Alice's Workspace");

    const second = await workspace.ensureUserHasWorkspace(db, 'u1', 'Alice');
    expect(second.map((w) => w.id)).toEqual(first.map((w) => w.id));
  });

  it('only owners can invite', async () => {
    const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
    expect(await workspace.inviteToWorkspace(db, ws.id, 'stranger', 'editor')).toBeNull();

    const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');
    expect(invite).not.toBeNull();
    expect(invite?.role).toBe('editor');
  });

  it('accepting an invitation adds the user as a member (idempotently)', async () => {
    const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
    const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');

    const joined = await workspace.acceptInvitation(db, invite!.token, 'u2');
    expect(joined?.id).toBe(ws.id);

    await workspace.acceptInvitation(db, invite!.token, 'u2');
    const members = await workspace.listMembers(db, ws.id);
    expect(members.filter((m) => m.userId === 'u2')).toHaveLength(1);
  });

  it('rejects an unknown invitation token', async () => {
    expect(await workspace.acceptInvitation(db, 'no-such-token', 'u2')).toBeNull();
  });
});
