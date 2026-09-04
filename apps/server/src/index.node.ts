import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { createDb } from './db/index.node.js';
import { getEnv } from './env.node.js';
import { staticMiddleware } from './static.node.js';

const env = getEnv();
const db = createDb(env);

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const webDist = env.WEB_DIST_PATH
  ? resolve(env.WEB_DIST_PATH)
  : resolve(packageRoot, '../web/dist');
const staticRoot = existsSync(webDist) ? webDist : undefined;

const app = buildApp({ db, env, staticHandler: staticMiddleware(staticRoot) });

const port = Number(env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`esbuddy server listening on http://localhost:${info.port}`);
  if (staticRoot) console.log(`serving SPA assets from ${staticRoot}`);
});
