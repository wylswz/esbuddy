/// <reference types="@cloudflare/workers-types" />
import { buildApp } from './app.js';
import { createD1Db } from './db/d1.worker.js';
import { envFromBindings, type WorkerBindings } from './env.worker.js';
import { assetsMiddleware } from './static.worker.js';

// Cloudflare Workers entrypoint. The counterpart of `index.ts` (Node bootstrap):
// it resolves platform primitives (D1 binding, Assets binding, vars/secrets) and
// hands them to the shared, platform-agnostic `buildApp`. No domain logic lives
// here — it only wires Cloudflare bindings to the app.

// Bindings are stable per isolate, so the app is built once and reused.
let app: ReturnType<typeof buildApp> | undefined;

export default {
  fetch(request: Request, bindings: WorkerBindings, ctx: ExecutionContext): Response | Promise<Response> {
    if (!app) {
      const env = envFromBindings(bindings);
      const db = createD1Db(bindings.DB);
      const staticHandler = bindings.ASSETS ? assetsMiddleware(bindings.ASSETS) : undefined;
      app = buildApp({ db, env, staticHandler });
    }
    return app.fetch(request, bindings, ctx);
  },
};
