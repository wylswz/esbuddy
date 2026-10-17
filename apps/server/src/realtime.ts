import type { Db } from './db/types.js';
import type { Env } from './env.js';
import { canvasAccess } from './modules/access/service.js';
import { verifyToken } from './modules/auth/jwt.js';

/*
 * Platform-neutral bits of the realtime endpoint shared by the Node (`ws`) and
 * Cloudflare (Durable Object) hosts. The endpoint is
 *
 *   GET /api/rooms/:canvasId?token=<jwt>     (Upgrade: websocket)
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
  | { ok: true; canvasId: string; userId: string; readOnly: boolean }
  /** 401: no/invalid token. 404: not a room URL, no such canvas, or no access to it. */
  | { ok: false; status: 401 | 404 };

/** Authenticate a room request and check the user may open that canvas. */
export async function authorizeRoomRequest(url: URL, env: Env, db: Db): Promise<RoomAuth> {
  const canvasId = parseRoomPath(url.pathname);
  if (!canvasId) return { ok: false, status: 404 };
  const token = url.searchParams.get('token');
  const userId = token ? await verifyToken(token, env) : null;
  if (!userId) return { ok: false, status: 401 };
  const access = await canvasAccess(db, canvasId, userId);
  if (!access) return { ok: false, status: 404 };
  return { ok: true, canvasId, userId, readOnly: access === 'read' };
}

/** Header the Worker sets when forwarding to the room DO (never trusted from clients). */
export const ROOM_READONLY_HEADER = 'x-esbuddy-room-readonly';

/** How long a room lingers in memory after its last participant leaves. */
export const ROOM_IDLE_MS = 30_000;
/** Debounce between the last edit and a persistence flush. */
export const FLUSH_DEBOUNCE_MS = 1_000;
