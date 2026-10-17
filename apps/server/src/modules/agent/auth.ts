import type { MiddlewareHandler } from 'hono';
import type { AppVariables } from '../../context.js';

export const requireWorkspaceToken: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  if (!c.var.workspaceToken) return c.json({ error: 'workspace token required' }, 403);
  c.header('Cache-Control', 'no-store');
  await next();
};
