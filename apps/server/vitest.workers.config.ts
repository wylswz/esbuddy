import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Workers project: runs inside Miniflare/workerd with a real D1 binding, proving
// the app behaves the same on Cloudflare as it does on Node. Drizzle migrations
// (the same ones wrangler applies to D1) are loaded here and applied per test
// worker via `applyD1Migrations` in the setup file.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle'));

  return {
    test: {
      name: 'workers',
      include: ['test/cf/**/*.test.ts'],
      setupFiles: ['./test/setup/apply-migrations.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2025-04-01',
            compatibilityFlags: ['nodejs_compat'],
            d1Databases: ['DB'],
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
