import { beforeEach, describe, expect, it } from 'vitest';
import * as auth from '../../src/modules/auth/service.js';
import * as workspace from '../../src/modules/workspace/service.js';
import { verifyToken } from '../../src/modules/auth/jwt.js';
import type { Db } from '../../src/db/types.js';
import { createTestDb } from '../helpers/db.js';
import { testEnv } from '../helpers/app.js';

const env = testEnv();
const profile = { googleSub: 'google:123', email: 'alice@example.com', name: 'Alice' };

describe('auth service', () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it('registers a new Google user and creates a personal workspace', async () => {
    const user = await auth.registerGoogleUser(db, profile);
    expect(user.email).toBe('alice@example.com');

    const workspaces = await workspace.listWorkspacesForUser(db, user.id);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("Alice's Workspace");
  });

  it('is idempotent for a returning user (no duplicate user or workspace)', async () => {
    const first = await auth.registerGoogleUser(db, profile);
    const second = await auth.registerGoogleUser(db, profile);
    expect(second.id).toBe(first.id);
    expect(await workspace.listWorkspacesForUser(db, first.id)).toHaveLength(1);
  });

  it('devLogin issues a verifiable token for the user', async () => {
    const { token, user } = await auth.devLogin(db, env, { email: 'dev@x.com', name: 'Dev' });
    expect(await verifyToken(token, env)).toBe(user.id);
  });

  it('getUser returns the stored user', async () => {
    const created = await auth.registerGoogleUser(db, profile);
    const fetched = await auth.getUser(db, created.id);
    expect(fetched?.id).toBe(created.id);
  });
});
