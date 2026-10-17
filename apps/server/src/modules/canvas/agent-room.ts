import {
  applyCanvasEdits, canvasRevision, CanvasEditError, docToSnapshot,
  type CollaborationIdentity, type LiveCanvasContent,
} from '@esbuddy/sdk';
import type { AgentPresence, CanvasEdits } from '@esbuddy/sdk/agent';
import type { CanvasRoom } from './room.js';

export type RoomCommand =
  | { type: 'read'; identity: CollaborationIdentity }
  | { type: 'edit'; identity: CollaborationIdentity; edits: CanvasEdits }
  | { type: 'presence'; identity: CollaborationIdentity; presence: AgentPresence | null };

export type RoomReply =
  | { status: 200; body: LiveCanvasContent | { ok: true } }
  | { status: 400 | 404 | 409; body: { error: string } };

export type RoomGateway = (canvasId: string, command: RoomCommand) => Promise<RoomReply>;
export const AGENT_ROOM_PREFIX = '/internal/agent/';

export function runRoomCommand(room: CanvasRoom, command: RoomCommand): RoomReply {
  try {
    if (command.type === 'presence') {
      room.setAgentPresence(command.identity, command.presence);
      return { status: 200, body: { ok: true } };
    }
    if (command.type === 'edit') applyCanvasEdits(room.doc, command.edits);
    room.setAgentPresence(command.identity);
    return { status: 200, body: { snapshot: docToSnapshot(room.doc), revision: canvasRevision(room.doc) } };
  } catch (error) {
    if (error instanceof CanvasEditError) return { status: error.status, body: { error: error.message } };
    throw error;
  }
}
