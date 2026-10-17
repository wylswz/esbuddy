import type { MiddlewareHandler } from 'hono';
import { verifyToken } from './jwt.js';
import { authenticateWorkspaceToken, WORKSPACE_TOKEN_PREFIX } from '../workspace/tokens.service.js';
import type { AppVariables } from '../../context.js';

/** Optionally resolves the bearer token into `c.var.userId`. */
export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    if (token.startsWith(WORKSPACE_TOKEN_PREFIX)) {
      const credential = await authenticateWorkspaceToken(c.var.db, token);
      if (credential) {
        c.set('workspaceToken', credential);
        c.set('userId', credential.identity.id);
      }
    } else {
      const userId = await verifyToken(token, c.var.env);
      if (userId) c.set('userId', userId);
    }
  }
  await next();
};

/** Agent credentials can edit their workspace, but cannot manage user accounts or credentials. */
export const requireSession: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  if (c.var.workspaceToken) return c.json({ error: 'user session required' }, 403);
  if (!c.var.userId) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

/** Rejects the request unless the user is authenticated. */
export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  if (!c.var.userId) return c.json({ error: 'unauthorized' }, 401);
  await next();
};
