import type { WorkerBindings } from './env.worker.js';
import { AGENT_ROOM_PREFIX, type RoomGateway, type RoomReply } from './modules/canvas/agent-room.js';

/** Only the authenticated app can reach this binding; the public Worker never forwards this path. */
export function agentRoomGateway(bindings: WorkerBindings): RoomGateway {
  return async (canvasId, command) => {
    const stub = bindings.CANVAS_ROOM.get(bindings.CANVAS_ROOM.idFromName(canvasId));
    const response = await stub.fetch(`https://room.internal${AGENT_ROOM_PREFIX}${encodeURIComponent(canvasId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error('Room command failed');
    return await response.json() as RoomReply;
  };
}
