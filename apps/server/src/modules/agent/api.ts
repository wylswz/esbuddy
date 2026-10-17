import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AGENT_OPERATIONS, agentOpenApi, type AgentOperationId } from '@esbuddy/sdk/agent';
import type { AppVariables } from '../../context.js';
import { LimitError } from '../../limits.js';
import { authMiddleware, requireAuth } from '../auth/middleware.js';
import { AgentApiError, runAgentOperation } from './service.js';
import { requireWorkspaceToken } from './auth.js';

export const agentRoutes = new Hono<{ Variables: AppVariables }>();
agentRoutes.use('*', authMiddleware, requireAuth, requireWorkspaceToken);
agentRoutes.use('*', bodyLimit({
  maxSize: 128_000,
  onError: (c) => c.json({ error: 'request too large' }, 413),
}));
agentRoutes.get('/openapi.json', (c) => c.json(agentOpenApi()));

for (const [id, operation] of Object.entries(AGENT_OPERATIONS)) {
  const route = operation.path.replace(/\{(\w+)\}/g, ':$1');
  agentRoutes.on(operation.method, route, async (c) => {
    let body: Record<string, unknown> = {};
    if (operation.method === 'POST' || operation.method === 'PUT') {
      const value: unknown = await c.req.json().catch(() => null);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return c.json({ error: 'JSON object required' }, 400);
      body = value as Record<string, unknown>;
    }
    const params = c.req.param();
    if (Object.keys(params).some((key) => key in body)) return c.json({ error: 'path parameters must not be in the body' }, 400);
    const parsed = operation.input.safeParse({ ...body, ...params });
    if (!parsed.success) return c.json({ error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, 400);
    try {
      const result = await runAgentOperation(id as AgentOperationId, parsed.data, {
        db: c.var.db, env: c.var.env, rooms: c.var.rooms, credential: c.var.workspaceToken!,
      });
      return c.json(result, id === 'esbuddy_create_canvas' ? 201 : 200);
    } catch (error) {
      if (error instanceof AgentApiError) return c.json({ error: error.message }, error.status);
      if (error instanceof LimitError) return c.json({ error: error.message }, 403);
      throw error;
    }
  });
}
