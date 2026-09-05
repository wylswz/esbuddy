import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { logger } from 'hono/logger';
import type { Env } from './env.js';
import { isDevMode } from './env.js';
import type { Db } from './db/types.js';
import type { AppVariables } from './context.js';
import { authRoutes } from './modules/auth/api.js';
import { canvasRoutes } from './modules/canvas/api.js';
import { invitationRoutes, workspaceRoutes } from './modules/workspace/api.js';

export interface AppDeps {
  db: Db;
  env: Env;
  // Platform-specific SPA asset serving (node fs middleware or Workers Assets
  // binding). Omit for an API-only deployment. Kept as an injected dependency so
  // the app itself stays free of any platform (`node:*` / Workers) imports.
  staticHandler?: MiddlewareHandler<{ Variables: AppVariables }>;
}

export function buildApp({ db, env, staticHandler }: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', logger());
  if (staticHandler) app.use('*', staticHandler);

  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('env', env);
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/api/config', (c) => c.json({ devMode: isDevMode(env) }));

  const api = new Hono<{ Variables: AppVariables }>();
  api.route('/auth', authRoutes);
  api.route('/canvases', canvasRoutes);
  api.route('/workspaces', workspaceRoutes);
  api.route('/invitations', invitationRoutes);

  app.route('/api', api);

  return app;
}
