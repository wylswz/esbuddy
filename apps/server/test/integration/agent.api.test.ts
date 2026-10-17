import { buildApp } from '../../src/app.js';
import { RoomHost } from '../../src/realtime.node.js';
import { testEnv } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { agentApiTests } from '../helpers/agent-api.js';

agentApiTests(() => {
  const db = createTestDb();
  const rooms = new RoomHost(db);
  const app = buildApp({ db, env: testEnv(), rooms: rooms.execute.bind(rooms) });
  return { request: async (path, init) => app.request(path, init), close: () => rooms.destroy() };
});
