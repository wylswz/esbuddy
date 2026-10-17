import { env } from 'cloudflare:test';
import { createD1Db } from '../../src/db/d1.worker.js';
import { workspaceTokenTests } from '../helpers/workspace-tokens.js';

workspaceTokenTests(() => createD1Db(env.DB));
