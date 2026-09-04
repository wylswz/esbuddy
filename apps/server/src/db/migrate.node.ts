import { getEnv } from '../env.node.js';
import { createDb } from './index.node.js';

// Standalone migration runner: `npm run db:migrate`
const env = getEnv();
createDb(env);
console.log('Migrations applied.');
