import { defineConfig } from 'vitest/config';

// Node project: unit tests and local integration tests. These exercise the
// platform-agnostic app + services against an in-memory better-sqlite3 DB, the
// same driver the Node bootstrap uses.
export default defineConfig({
  test: {
    name: 'node',
    environment: 'node',
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
  },
});
