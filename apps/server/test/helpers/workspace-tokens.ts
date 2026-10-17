import { eq } from 'drizzle-orm';
import type { CanvasMeta, CollaborationIdentity, CreatedWorkspaceToken, Invitation, Workspace, WorkspaceToken } from '@esbuddy/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/types.js';
import { workspaceTokens } from '../../src/db/schema.js';
import { authHeaders, buildAppWithDb, devLogin, type TestApp } from './app.js';

/** Identical contract tests on SQLite and D1. */
export function workspaceTokenTests(makeDb: () => Db) {
  describe('workspace tokens', () => {
    let db: Db;
    let app: TestApp;
    let session: string;
    let ownerId: string;
    let workspace: Workspace;
    let canvas: CanvasMeta;

    beforeEach(async () => {
      db = makeDb();
      app = buildAppWithDb(db);
      const login = await devLogin(app);
      session = login.token;
      ownerId = login.user.id;
      [workspace] = await (await app.request('/api/workspaces', { headers: authHeaders(session) })).json() as Workspace[];
      [canvas] = await (await app.request(`/api/canvases?workspace=${workspace.id}`, {
        headers: authHeaders(session),
      })).json() as CanvasMeta[];
    });

    const path = () => `/api/workspaces/${workspace.id}/tokens`;
    const request = (method: string, url: string, token = session, body?: unknown) => app.request(url, {
      method, headers: authHeaders(token), body: body === undefined ? undefined : JSON.stringify(body),
    });
    const create = async (input: unknown = { name: 'Domain expert' }) => {
      const res = await request('POST', path(), session, input);
      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('no-store');
      return await res.json() as CreatedWorkspaceToken;
    };

    it('creates distinct, stable identities, returns the secret once and only stores its hash', async () => {
      const a = await create({ name: '  Domain expert  ' });
      const b = await create({ name: 'Domain expert' });
      expect(a.token).toMatch(/^esb_[0-9a-f]{64}$/);
      expect(a.identity).toMatchObject({ id: `agent:${a.id}`, name: 'Domain expert', kind: 'agent' });
      expect(a.identity.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(a.identity.id).not.toBe(ownerId);
      expect(b.identity.id).not.toBe(a.identity.id);
      expect(b.token).not.toBe(a.token);
      expect(a.prefix).toBe(a.token.slice(0, 12));
      expect(a.expiresAt - a.createdAt).toBeGreaterThan(89 * 86_400_000);
      const row = await db.select().from(workspaceTokens).where(eq(workspaceTokens.id, a.id)).get();
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(a.token);
      const res = await request('GET', path());
      const list = await res.json() as WorkspaceToken[];
      expect(list.find((item) => item.id === a.id)?.identity).toEqual(a.identity);
      expect(JSON.stringify(list)).not.toContain(a.token);
      expect(JSON.stringify(list)).not.toContain('tokenHash');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const identity = await (await request('GET', '/api/auth/identity', a.token)).json() as CollaborationIdentity;
      expect(identity).toEqual(a.identity);
    });

    it('only owners can manage credentials; tokens cannot mint tokens or manage membership', async () => {
      const credential = await create();
      expect((await app.request(path())).status).toBe(401);
      const stranger = await devLogin(app, { email: 'stranger@example.com' });
      expect((await request('GET', path(), stranger.token)).status).toBe(404);
      for (const role of ['editor', 'viewer']) {
        const invite = await (await request('POST', `/api/workspaces/${workspace.id}/invitations`, session, { role })).json() as Invitation;
        const member = await devLogin(app, { email: `${role}@example.com` });
        await request('POST', `/api/invitations/${invite.token}/accept`, member.token);
        for (const [method, url, body] of [
          ['GET', path()],
          ['POST', path(), { name: 'Escalation' }],
          ['DELETE', `${path()}/${credential.id}`],
        ] as const) {
          expect((await request(method, url, member.token, body)).status).toBe(403);
        }
      }
      for (const [method, url, body] of [
        ['GET', path()],
        ['POST', path(), { name: 'Escalation' }],
        ['DELETE', `${path()}/${credential.id}`],
        ['POST', '/api/workspaces', { name: 'Another workspace' }],
        ['DELETE', `/api/workspaces/${workspace.id}`],
        ['POST', `/api/workspaces/${workspace.id}/invitations`, { role: 'editor' }],
        ['POST', '/api/invitations/anything/accept'],
      ] as const) {
        expect((await request(method, url, credential.token, body)).status, `${method} ${url}`).toBe(403);
      }
    });

    it('scopes agents to one workspace, including default list and canvas creation', async () => {
      const credential = await create();
      const other = await (await request('POST', '/api/workspaces', session, { name: 'Other' })).json() as Workspace;
      const privateCanvas = await (await request('POST', '/api/canvases', session, { name: 'Personal' })).json() as CanvasMeta;
      const foreignCanvas = await (await request('POST', '/api/canvases', session, {
        name: 'Foreign', owner: { type: 'workspace', workspaceId: other.id },
      })).json() as CanvasMeta;
      const list = await (await request('GET', '/api/workspaces', credential.token)).json() as Workspace[];
      expect(list.map((item) => item.id)).toEqual([workspace.id]);
      const canvases = await (await request('GET', '/api/canvases', credential.token)).json() as CanvasMeta[];
      expect(canvases.map((item) => item.id)).toContain(canvas.id);
      const created = await request('POST', '/api/canvases', credential.token, { name: 'Agent board' });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({ owner: { type: 'workspace', workspaceId: workspace.id } });
      for (const foreign of [privateCanvas, foreignCanvas]) {
        expect((await request('GET', `/api/canvases/${foreign.id}`, credential.token)).status).toBe(404);
        expect((await request('PATCH', `/api/canvases/${foreign.id}`, credential.token, { name: 'No' })).status).toBe(404);
        expect((await request('POST', '/api/canvases', credential.token, { name: 'No', owner: foreign.owner })).status).toBe(404);
      }
      expect((await request('GET', `/api/canvases?workspace=${other.id}`, credential.token)).status).toBe(404);
      expect((await request('GET', `/api/workspaces/${other.id}/members`, credential.token)).status).toBe(404);
      expect((await request('PATCH', `/api/canvases/${canvas.id}`, credential.token, { name: 'Renamed' })).status).toBe(200);
      const published = await request('POST', `/api/canvases/${canvas.id}/versions`, credential.token, {
        snapshot: { nodes: [], edges: [], viewport: null },
      });
      expect(published.status).toBe(201);
      expect(await published.json()).toMatchObject({ createdById: credential.identity.id });
    });

    it('viewers can read but cannot write', async () => {
      const credential = await create({ name: 'Observer', role: 'viewer' });
      expect((await request('GET', `/api/canvases/${canvas.id}`, credential.token)).status).toBe(200);
      for (const [method, url, body] of [
        ['POST', '/api/canvases', { name: 'No' }],
        ['PATCH', `/api/canvases/${canvas.id}`, { name: 'No' }],
        ['DELETE', `/api/canvases/${canvas.id}`],
        ['POST', `/api/canvases/${canvas.id}/versions`, { snapshot: { nodes: [], edges: [], viewport: null } }],
      ] as const) {
        expect((await request(method, url, credential.token, body)).status).toBe(403);
      }
    });

    it('rejects revoked, expired and malformed credentials and cleans up on workspace deletion', async () => {
      const a = await create();
      const b = await create();
      const other = await (await request('POST', '/api/workspaces', session, { name: 'Other' })).json() as Workspace;
      expect((await request('DELETE', `/api/workspaces/${other.id}/tokens/${a.id}`)).status).toBe(404);
      expect((await request('DELETE', `${path()}/${a.id}`)).status).toBe(204);
      await db.update(workspaceTokens).set({ expiresAt: Date.now() - 1 }).where(eq(workspaceTokens.id, b.id)).run();
      for (const token of [a.token, b.token, 'esb_invalid', `${a.token.slice(0, -1)}z`]) {
        expect((await request('GET', '/api/canvases', token)).status).toBe(401);
        expect((await request('GET', '/api/auth/identity', token)).status).toBe(401);
      }
      const list = await (await request('GET', path())).json() as WorkspaceToken[];
      expect(list.find((item) => item.id === a.id)?.revokedAt).toBeTypeOf('number');
      expect((await request('DELETE', `/api/workspaces/${workspace.id}`)).status).toBe(204);
      expect(await db.select().from(workspaceTokens).where(eq(workspaceTokens.workspaceId, workspace.id)).all()).toEqual([]);
    });

    it('validates identity, role, expiration and malformed JSON', async () => {
      for (const input of [
        null, [], 'name', {}, { name: '' }, { name: ' ' }, { name: 'x'.repeat(81) }, { name: 'x\n' },
        { name: 'Agent', role: 'owner' }, { name: 'Agent', expiresAt: 0 },
        { name: 'Agent', expiresAt: 'tomorrow' }, { name: 'Agent', expiresAt: Date.now() + 400 * 86_400_000 },
      ]) {
        expect((await request('POST', path(), session, input)).status).toBe(400);
      }
      const malformed = await app.request(path(), { method: 'POST', headers: authHeaders(session), body: '{' });
      expect(malformed.status).toBe(400);
    });
  });
}
