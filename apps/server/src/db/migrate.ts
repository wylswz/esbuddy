import { getEnv } from '../env.js';
import { createDb } from './index.js';

// Standalone migration runner: `npm run db:migrate`
const env = getEnv();
createDb(env);
console.log('Migrations applied.');
