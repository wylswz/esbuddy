import type { Env } from './env.js';
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

export interface RoomRequest {
  canvasId: string;
  userId: string;
}

/** Resolve + authenticate a room request; null means "not a room URL or unauthorised". */
export async function authorizeRoomRequest(url: URL, env: Env): Promise<RoomRequest | null> {
  const canvasId = parseRoomPath(url.pathname);
  if (!canvasId) return null;
  const token = url.searchParams.get('token');
  if (!token) return null;
  const userId = await verifyToken(token, env);
  return userId ? { canvasId, userId } : null;
}

/** How long a room lingers in memory after its last participant leaves. */
export const ROOM_IDLE_MS = 30_000;
/** Debounce between the last edit and a persistence flush. */
export const FLUSH_DEBOUNCE_MS = 1_000;
