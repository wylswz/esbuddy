import type { Env } from './env.js';
import type { Db } from './db/types.js';
import type { WorkspaceToken } from '@esbuddy/sdk';
import type { RoomGateway } from './modules/canvas/agent-room.js';

export interface AppVariables {
  db: Db;
  env: Env;
  userId?: string;
  workspaceToken?: WorkspaceToken;
  rooms?: RoomGateway;
}
