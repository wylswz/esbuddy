import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '../auth/jwt.js';
import type { AppVariables } from '../context.js';

/** Optionally resolves the bearer token into `c.var.userId`. */
export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const userId = await verifyToken(header.slice(7), c.var.env);
    if (userId) c.set('userId', userId);
  }
  await next();
};

/** Rejects the request unless the user is authenticated. */
export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  if (!c.var.userId) return c.json({ error: 'unauthorized' }, 401);
  await next();
};
