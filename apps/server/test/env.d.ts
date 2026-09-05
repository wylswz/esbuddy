import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

// Types for the `cloudflare:test` module's `env`, matching the bindings declared
// in vitest.workers.config.ts.
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
