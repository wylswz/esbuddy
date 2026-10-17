import type { Db } from './db/types.js';
import type { Env } from './env.js';
import type { WorkspaceToken } from '@esbuddy/sdk';
import { canvasAccess } from './modules/access/service.js';
import { verifyToken } from './modules/auth/jwt.js';
import { authenticateWorkspaceToken, WORKSPACE_TOKEN_PREFIX } from './modules/workspace/tokens.service.js';

/*
 * Platform-neutral bits of the realtime endpoint shared by the Node (`ws`) and
 * Cloudflare (Durable Object) hosts. The endpoint is
 *
 *   GET /api/rooms/:canvasId?token=<credential>     (Upgrade: websocket)
 *
 * which matches how the stock `y-websocket` client builds URLs
 * (`<serverUrl>/<roomName>?<params>`). Browsers cannot set headers on a
 * WebSocket handshake, hence the token in the query string.
 */

export const ROOMS_PREFIX = '/api/rooms/';

/** Extract the canvas id from a room URL path, or null if it isn't one. */
export function parseRoomPath(pathname: string): string | null {
  if (!pathname.startsWith(ROOMS_PREFIX)) return null;
  const rest = pathname.slice(ROOMS_PREFIX.length).replace(/\/+$/, '');
  if (!rest || rest.includes('/')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function isWebSocketUpgrade(headers: { get(name: string): string | null }): boolean {
  return headers.get('upgrade')?.toLowerCase() === 'websocket';
}

export type RoomAuth =
  | { ok: true; canvasId: string; userId: string; readOnly: boolean; workspaceToken?: WorkspaceToken }
  /** 401: no/invalid token. 404: not a room URL, no such canvas, or no access to it. */
  | { ok: false; status: 401 | 404 };

/** Authenticate a room request and check the user may open that canvas. */
export async function authorizeRoomRequest(
  url: URL, env: Env, db: Db, authorization?: string | null,
): Promise<RoomAuth> {
  const canvasId = parseRoomPath(url.pathname);
  if (!canvasId) return { ok: false, status: 404 };
  // Native agent clients can keep secrets out of URLs; browsers use the query fallback.
  const token = authorization == null ? url.searchParams.get('token')
    : authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (token?.startsWith(WORKSPACE_TOKEN_PREFIX)) {
    const credential = await authenticateWorkspaceToken(db, token);
    if (!credential) return { ok: false, status: 401 };
    const access = await canvasAccess(db, canvasId, credential);
    if (!access) return { ok: false, status: 404 };
    return {
      ok: true, canvasId, userId: credential.identity.id, readOnly: access === 'read', workspaceToken: credential,
    };
  }
  const userId = token ? await verifyToken(token, env) : null;
  if (!userId) return { ok: false, status: 401 };
  const access = await canvasAccess(db, canvasId, userId);
  if (!access) return { ok: false, status: 404 };
  return { ok: true, canvasId, userId, readOnly: access === 'read' };
}

/** Header the Worker sets when forwarding to the room DO (never trusted from clients). */
export const ROOM_READONLY_HEADER = 'x-esbuddy-room-readonly';
/** Internal token id, not its secret. Always overwritten at the Worker trust boundary. */
export const ROOM_TOKEN_HEADER = 'x-esbuddy-room-token';

/** How long a room lingers in memory after its last participant leaves. */
export const ROOM_IDLE_MS = 30_000;
/** Debounce between the last edit and a persistence flush. */
export const FLUSH_DEBOUNCE_MS = 1_000;
