import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanvasMeta, CreatedWorkspaceToken, LiveCanvas, Workspace } from '@esbuddy/sdk';
import { AGENT_API_PATH, AGENT_OPERATIONS, agentMcpTools, agentOpenApi } from '@esbuddy/sdk/agent';

export interface AgentApiFixture {
  request(path: string, init?: RequestInit): Promise<Response>;
  close?(): Promise<void>;
}

export function agentApiTests(createFixture: () => AgentApiFixture | Promise<AgentApiFixture>) {
  describe('agent OpenAPI and remote MCP', () => {
    let fixture: AgentApiFixture;
    let session: string;
    let workspace: Workspace;
    let credential: CreatedWorkspaceToken;
    let canvas: CanvasMeta;
    const headers = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
    const request = (path: string, token = credential.token, method = 'GET', body?: unknown) => fixture.request(path, {
      method, headers: headers(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const api = (path: string, method = 'GET', body?: unknown, token = credential.token) =>
      request(AGENT_API_PATH + path, token, method, body);
    const rpc = async (method: string, params: unknown = {}, token = credential.token) => {
      const response = await fixture.request('/api/mcp', {
        method: 'POST',
        headers: { ...headers(token), accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return response;
    };
    const tool = async (name: string, args: unknown = {}, token = credential.token) => {
      const response = await rpc('tools/call', { name, arguments: args }, token);
      expect(response.status).toBe(200);
      return (await response.json() as { result: { isError?: boolean; structuredContent: Record<string, unknown> } }).result;
    };
    const createToken = async (name: string, role = 'editor') => {
      const response = await request(`/api/workspaces/${workspace.id}/tokens`, session, 'POST', { name, role });
      expect(response.status).toBe(201);
      return await response.json() as CreatedWorkspaceToken;
    };

    beforeEach(async () => {
      fixture = await createFixture();
      const login = await fixture.request('/api/auth/dev-login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `agent-api-${crypto.randomUUID()}@example.com`, name: 'Agent tester' }),
      });
      session = (await login.json() as { token: string }).token;
      [workspace] = await (await request('/api/workspaces', session)).json() as Workspace[];
      credential = await createToken('Domain expert');
      const created = await api('/canvases', 'POST', { name: 'Brainstorm' });
      expect(created.status).toBe(201);
      canvas = await created.json() as CanvasMeta;
    });
    afterEach(async () => { await fixture?.close?.(); });

    it('generates OpenAPI and MCP tools from the same validated contract', async () => {
      const response = await api('/openapi.json');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(agentOpenApi());
      const tools = await rpc('tools/list');
      expect((await tools.json() as { result: { tools: unknown[] } }).result.tools).toEqual(agentMcpTools());
      expect(agentMcpTools().map((tool) => tool.name).sort()).toEqual(Object.keys(AGENT_OPERATIONS).sort());
      const initialized = await rpc('initialize', {
        protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'contract-test', version: '1.0' },
      });
      expect(initialized.status).toBe(200);
      expect(await initialized.json()).toMatchObject({ result: { serverInfo: { name: 'esbuddy' }, capabilities: { tools: {} } } });
      expect(initialized.headers.get('mcp-session-id')).toBeNull();
    });

    it('requires workspace tokens for OpenAPI and every MCP request', async () => {
      expect((await fixture.request(`${AGENT_API_PATH}/identity`)).status).toBe(401);
      expect((await api('/identity', 'GET', undefined, session)).status).toBe(403);
      expect((await rpc('tools/list', {}, 'invalid')).status).toBe(401);
      expect((await rpc('tools/list', {}, session)).status).toBe(403);
      expect(await (await api('/identity')).json()).toEqual(credential.identity);
      expect(await (await api('/workspaces')).json()).toEqual([workspace]);
      expect(await (await api('/grammar')).json()).toMatchObject({ elementTypes: expect.arrayContaining(['event', 'hotspot', 'note']) });
      const other = await createToken('Challenger');
      expect((await tool('esbuddy_identity', {}, other.token)).structuredContent.result).toEqual(other.identity);
      expect((await tool('esbuddy_identity')).structuredContent.result).toEqual(credential.identity);
    });

    it('reads and edits live content with revision conflict protection', async () => {
      const initial = await (await api(`/canvases/${canvas.id}`)).json() as LiveCanvas;
      const edits = {
        expectedRevision: initial.revision,
        operations: [{ op: 'add_node', id: 'idea', type: 'note', label: 'An idea', position: { x: 0, y: 0 } }],
      };
      const response = await api(`/canvases/${canvas.id}/edits`, 'POST', edits);
      expect(response.status).toBe(200);
      const live = await response.json() as LiveCanvas;
      expect(live.snapshot.nodes).toMatchObject([{ id: 'idea', data: { label: 'An idea' } }]);
      expect(live.revision).not.toBe(initial.revision);
      expect((await api(`/canvases/${canvas.id}/edits`, 'POST', edits)).status).toBe(409);
      expect((await (await api(`/canvases/${canvas.id}/analysis`)).json())).toMatchObject({ hasErrors: false });
      expect((await (await api(`/canvases/${canvas.id}/compile`)).json())).toMatchObject({ ok: true });
      const invalid = await api(`/canvases/${canvas.id}/edits`, 'POST', { operations: [
        { op: 'add_node', id: 'not-applied', type: 'note', label: 'No', position: { x: 0, y: 0 } },
        { op: 'add_edge', id: 'invalid', source: 'idea', target: 'missing' },
      ] });
      expect(invalid.status).toBe(400);
      expect((await (await api(`/canvases/${canvas.id}`)).json() as LiveCanvas).revision).toBe(live.revision);
    });

    it('uses the same live operations from MCP and REST, without accepting spoofed identity fields', async () => {
      const result = await tool('esbuddy_edit_canvas', { canvasId: canvas.id, operations: [
        { op: 'add_node', id: 'mcp-note', type: 'note', label: 'From MCP', position: { x: 0, y: 0 } },
      ] });
      expect(result.isError).not.toBe(true);
      const live = await (await api(`/canvases/${canvas.id}`)).json() as LiveCanvas;
      expect(live.snapshot.nodes[0].data.label).toBe('From MCP');
      expect((await tool('esbuddy_read_canvas', { canvasId: canvas.id })).structuredContent.result).toEqual(live);
      const conflict = await tool('esbuddy_edit_canvas', { canvasId: canvas.id, expectedRevision: 'stale', operations: [
        { op: 'update_node', id: 'mcp-note', patch: { label: 'No' } },
      ] });
      expect(conflict).toMatchObject({ isError: true, structuredContent: { status: 409 } });
      expect((await tool('esbuddy_join_canvas', { canvasId: canvas.id, identity: { name: 'Fake' } })).isError).toBe(true);
      expect((await tool('esbuddy_leave_canvas', { canvasId: canvas.id })).structuredContent.result).toEqual({ ok: true });
    });

    it('enforces workspace scope, viewer rights and revocation equally for HTTP and MCP', async () => {
      const privateCanvas = await (await request('/api/canvases', session, 'POST', { name: 'Private' })).json() as CanvasMeta;
      expect((await api(`/canvases/${privateCanvas.id}`)).status).toBe(404);
      expect((await tool('esbuddy_read_canvas', { canvasId: privateCanvas.id })).structuredContent).toMatchObject({ status: 404 });
      const viewer = await createToken('Observer', 'viewer');
      expect((await api(`/canvases/${canvas.id}`, 'GET', undefined, viewer.token)).status).toBe(200);
      expect((await tool('esbuddy_create_canvas', { name: 'No' }, viewer.token)).structuredContent).toMatchObject({ status: 403 });
      expect((await api('/canvases', 'POST', { name: 'No' }, viewer.token)).status).toBe(403);
      expect((await tool('esbuddy_join_canvas', { canvasId: canvas.id }, viewer.token)).isError).not.toBe(true);
      expect((await request(`/api/workspaces/${workspace.id}/tokens/${credential.id}`, session, 'DELETE')).status).toBe(204);
      expect((await api('/identity')).status).toBe(401);
      expect((await rpc('tools/list')).status).toBe(401);
    });

    it('rejects malformed/oversized payloads, foreign origins and unsupported transport methods', async () => {
      expect((await api('/canvases', 'POST', { name: 'No', owner: { type: 'user', userId: 'fake' } })).status).toBe(400);
      expect((await api(`/canvases/${canvas.id}/edits`, 'POST', { canvasId: canvas.id, operations: [] })).status).toBe(400);
      expect((await api('/canvases', 'POST', { name: 'x'.repeat(130_000) })).status).toBe(413);
      expect((await request('/api/mcp')).status).toBe(405);
      const foreign = await fixture.request('/api/mcp', {
        method: 'POST', headers: { ...headers(credential.token), origin: 'https://untrusted.example' }, body: '{}',
      });
      expect(foreign.status).toBe(403);
      const malformed = await fixture.request(`${AGENT_API_PATH}/canvases`, {
        method: 'POST', headers: headers(credential.token), body: '{',
      });
      expect(malformed.status).toBe(400);
    });
  });
}
