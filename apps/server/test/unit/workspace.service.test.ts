import { beforeEach, describe, expect, it } from 'vitest';
import * as canvas from '../../src/modules/canvas/service.js';
import * as workspace from '../../src/modules/workspace/service.js';
import { LimitError } from '../../src/limits.js';
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

  describe('deleteWorkspace', () => {
    it('cascade-deletes a workspace, its canvases, members and invitations', async () => {
      const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
      const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');
      await workspace.acceptInvitation(db, invite!.token, 'u2');

      // Pre-condition: workspace has canvases, members, invitations.
      expect((await canvas.listCanvases(db, 'owner-1', ws.id)).length).toBeGreaterThan(0);
      expect(await workspace.listMembers(db, ws.id)).toHaveLength(2);

      const ok = await workspace.deleteWorkspace(db, ws.id, 'owner-1');
      expect(ok).toBe(true);

      // Workspace is gone.
      const remaining = await workspace.listWorkspacesForUser(db, 'owner-1');
      expect(remaining).toHaveLength(0);
      // Canvases owned by the workspace are gone.
      expect(await canvas.listCanvases(db, 'owner-1', ws.id)).toHaveLength(0);
      // Members are gone.
      expect(await workspace.listMembers(db, ws.id)).toHaveLength(0);
    });

    it('returns false for a non-owner', async () => {
      const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
      const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');
      await workspace.acceptInvitation(db, invite!.token, 'u2');

      const ok = await workspace.deleteWorkspace(db, ws.id, 'u2');
      expect(ok).toBe(false);
      // Workspace still exists.
      expect(await workspace.listWorkspacesForUser(db, 'owner-1')).toHaveLength(1);
    });

    it('returns false for a missing workspace', async () => {
      expect(await workspace.deleteWorkspace(db, 'no-such-ws', 'u1')).toBe(false);
    });
  });

  describe('limits', () => {
    it('createWorkspace enforces maxWorkspacesPerUser', async () => {
      await workspace.createWorkspace(db, 'W1', 'u1');
      await expect(
        workspace.createWorkspace(db, 'W2', 'u1', { maxWorkspacesPerUser: 1 }),
      ).rejects.toThrow(LimitError);
    });

    it('createWorkspace without limits bypasses the cap (internal use)', async () => {
      await workspace.createWorkspace(db, 'W1', 'u1');
      await workspace.createWorkspace(db, 'W2', 'u1');
      expect(await workspace.listWorkspacesForUser(db, 'u1')).toHaveLength(2);
    });

    it('acceptInvitation enforces maxMembersPerWorkspace for new members', async () => {
      const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
      // owner-1 is already a member (count = 1); cap at 1 means no new members.
      const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');
      await expect(
        workspace.acceptInvitation(db, invite!.token, 'u2', { maxMembersPerWorkspace: 1 }),
      ).rejects.toThrow(LimitError);
    });

    it('acceptInvitation lets existing members re-join regardless of cap', async () => {
      const ws = await workspace.createWorkspace(db, 'Team', 'owner-1');
      const invite = await workspace.inviteToWorkspace(db, ws.id, 'owner-1', 'editor');
      await workspace.acceptInvitation(db, invite!.token, 'u2');
      // u2 is already a member; re-accepting should not hit the cap.
      const joined = await workspace.acceptInvitation(db, invite!.token, 'u2', { maxMembersPerWorkspace: 2 });
      expect(joined?.id).toBe(ws.id);
    });
  });
});
