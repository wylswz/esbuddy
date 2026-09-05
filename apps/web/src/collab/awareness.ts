import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

/*
 * Presence ("awareness") shared between participants of a canvas. Unlike the
 * document it is ephemeral: each client broadcasts its own state and peers
 * drop it when the client disconnects or goes quiet.
 */

export interface PeerUser {
  id: string;
  name: string;
  color: string;
}

export interface PeerState {
  user: PeerUser;
  /** Pointer position in flow (canvas) coordinates; null when off the board. */
  cursor: { x: number; y: number } | null;
  /** Ids of the nodes this peer currently has selected. */
  selection: string[];
}

const PALETTE = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#c026d3'];

/** Stable colour per user id (same user → same colour on every client). */
export function userColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function isPeerState(v: unknown): v is PeerState {
  if (!v || typeof v !== 'object') return false;
  const u = (v as { user?: unknown }).user;
  return !!u && typeof u === 'object' && typeof (u as { id?: unknown }).id === 'string';
}

/** Live map of *other* participants (own clientID excluded). */
export function useAwarenessPeers(awareness: Awareness): Map<number, PeerState> {
  const [peers, setPeers] = useState<Map<number, PeerState>>(() => readPeers(awareness));
  useEffect(() => {
    const update = () => setPeers(readPeers(awareness));
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness]);
  return peers;
}

function readPeers(awareness: Awareness): Map<number, PeerState> {
  const out = new Map<number, PeerState>();
  awareness.getStates().forEach((state, clientId) => {
    if (clientId !== awareness.clientID && isPeerState(state)) out.set(clientId, state);
  });
  return out;
}
