import { defineConfig } from 'vitest/config';

// Two projects run in a single `vitest` invocation:
//  - `node`    : unit + local integration tests (better-sqlite3, node runtime)
//  - `workers` : Cloudflare integration tests (Miniflare/workerd + real D1)
// Run one in isolation with `vitest --project node` / `--project workers`.
export default defineConfig({
  test: {
    projects: ['./vitest.node.config.ts', './vitest.workers.config.ts'],
  },
});
