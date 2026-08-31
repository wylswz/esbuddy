import type { Env } from './env.js';
import type { Db } from './db/index.js';

export interface AppVariables {
  db: Db;
  env: Env;
  userId?: string;
}
