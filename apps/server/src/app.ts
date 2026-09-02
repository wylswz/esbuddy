import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Env } from './env.js';
import { isDevMode } from './env.js';
import type { Db } from './db/index.js';
import type { AppVariables } from './context.js';
import { authRoutes } from './routes/auth.js';
import { canvasRoutes } from './routes/canvases.js';
import { invitationRoutes, workspaceRoutes } from './routes/workspaces.js';
import { staticMiddleware } from './static.js';

export interface AppDeps {
  db: Db;
  env: Env;
  staticRoot?: string; // path to the built SPA assets (Node single deployment)
}

export function buildApp({ db, env, staticRoot }: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', logger());
  app.use('*', staticMiddleware(staticRoot));

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
