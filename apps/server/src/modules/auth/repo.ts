import { eq } from 'drizzle-orm';
import type { User } from '@esbuddy/sdk';
import type { Db } from '../../db/types.js';
import { users } from '../../db/schema.js';

const now = () => Date.now();

function rowToUser(r: typeof users.$inferSelect): User {
  return { id: r.id, name: r.name, email: r.email, avatarUrl: r.avatarUrl, provider: r.provider, createdAt: r.createdAt };
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const r = await db.select().from(users).where(eq(users.id, id)).get();
  return r ? rowToUser(r) : null;
}

export async function getUserByGoogleSub(db: Db, googleSub: string): Promise<User | null> {
  const r = await db.select().from(users).where(eq(users.googleSub, googleSub)).get();
  return r ? rowToUser(r) : null;
}

export async function insertUser(
  db: Db,
  input: { googleSub: string; email: string; name: string; avatarUrl?: string | null },
): Promise<User> {
  const row = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    avatarUrl: input.avatarUrl ?? null,
    provider: 'google',
    googleSub: input.googleSub,
    createdAt: now(),
  };
  await db.insert(users).values(row).run();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    provider: row.provider,
    createdAt: row.createdAt,
  };
}
