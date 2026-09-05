import { applyD1Migrations, env } from 'cloudflare:test';

// Apply the Drizzle-generated D1 migrations to the isolated test database before
// any Cloudflare integration test runs. `applyD1Migrations` tracks what has
// already been applied, so this is safe to run for every test worker.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
