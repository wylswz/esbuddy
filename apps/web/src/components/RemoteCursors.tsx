import { memo } from 'react';
import { useViewport } from 'reactflow';
import type { PeerState } from '../collab/awareness';

interface RemoteCursorsProps {
  peers: ReadonlyMap<number, PeerState>;
}

/**
 * Other participants' pointers, drawn over the board. Must be rendered as a
 * child of <ReactFlow> so `useViewport` can project flow → screen coordinates.
 */
function RemoteCursorsComponent({ peers }: RemoteCursorsProps) {
  const { x: vx, y: vy, zoom } = useViewport();
  const visible = Array.from(peers.entries()).filter(([, p]) => p.cursor);
  if (visible.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-5 overflow-hidden">
      {visible.map(([clientId, peer]) => {
        const { x, y } = peer.cursor!;
        return (
          <div
            key={clientId}
            className="absolute transition-transform duration-75 ease-out will-change-transform"
            style={{ transform: `translate(${x * zoom + vx}px, ${y * zoom + vy}px)` }}
          >
            <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow-sm">
              <path d="M1 1 L17 9.5 L9.5 11 L6 19 Z" fill={peer.user.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
            <span
              className="absolute left-4 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: peer.user.color }}
            >
              {peer.user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const RemoteCursors = memo(RemoteCursorsComponent);
