/// <reference types="@cloudflare/workers-types" />
import { buildApp } from './app.js';
import { createD1Db } from './db/d1.worker.js';
import { envFromBindings, type WorkerBindings } from './env.worker.js';
import { authorizeRoomRequest, isWebSocketUpgrade, parseRoomPath } from './realtime.js';
import { assetsMiddleware } from './static.worker.js';

// The Durable Object class must be exported from the Worker entry for the
// `CANVAS_ROOM` binding in wrangler.jsonc to resolve.
export { CanvasRoomObject } from './room.worker.js';

// Cloudflare Workers entrypoint. The counterpart of `index.node.ts` (Node
// bootstrap): it resolves platform primitives (D1 binding, Assets binding,
// vars/secrets) and hands them to the shared, platform-agnostic `buildApp`. No
// domain logic lives here — it only wires Cloudflare bindings to the app.

// Bindings are stable per isolate, so the app is built once and reused.
let app: ReturnType<typeof buildApp> | undefined;

export default {
  async fetch(request: Request, bindings: WorkerBindings, ctx: ExecutionContext): Promise<Response> {
    const env = envFromBindings(bindings);

    // Realtime rooms: authenticate here (the Worker is the trust boundary),
    // then hand the upgrade to the canvas's Durable Object.
    const url = new URL(request.url);
    if (parseRoomPath(url.pathname)) {
      if (!isWebSocketUpgrade(request.headers)) return new Response('expected websocket upgrade', { status: 426 });
      const auth = await authorizeRoomRequest(url, env);
      if (!auth) return new Response('unauthorized', { status: 401 });
      const stub = bindings.CANVAS_ROOM.get(bindings.CANVAS_ROOM.idFromName(auth.canvasId));
      return stub.fetch(request);
    }

    if (!app) {
      const db = createD1Db(bindings.DB);
      const staticHandler = bindings.ASSETS ? assetsMiddleware(bindings.ASSETS) : undefined;
      app = buildApp({ db, env, staticHandler });
    }
    return app.fetch(request, bindings, ctx);
  },
};
