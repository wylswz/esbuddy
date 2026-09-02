import { useEffect, useState } from 'react';
import type { CanvasNode, CanvasSnapshot, Store } from '@esbuddy/sdk';

interface CanvasThumbnailProps {
  store: Store;
  canvasId: string;
}

const NODE_COLORS: Record<string, string> = {
  event: '#f97316',
  command: '#3b82f6',
  aggregate: '#10b981',
  actor: '#eab308',
  policy: '#a855f7',
  external: '#ec4899',
  hotspot: '#991b1b',
  readmodel: '#10b981',
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function nodeBox(n: CanvasNode): Box {
  const style = (n as { style?: { width?: number; height?: number } }).style;
  const isAgg = n.type === 'aggregate';
  const w = n.width ?? style?.width ?? (isAgg ? 400 : 180);
  const h = n.height ?? style?.height ?? (isAgg ? 260 : 84);
  return { x: n.position.x, y: n.position.y, w, h };
}

export function CanvasThumbnail({ store, canvasId }: CanvasThumbnailProps) {
  const [snapshot, setSnapshot] = useState<CanvasSnapshot | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    store
      .getCanvas(canvasId)
      .then((rec) => {
        if (!cancelled) setSnapshot(rec?.snapshot ?? null);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [store, canvasId]);

  // Placeholder while loading or when there is nothing to draw.
  if (!snapshot || snapshot.nodes.length === 0) {
    return <div className="flex-1 bg-linear-to-br from-gray-50 to-gray-100" />;
  }

  const boxes = snapshot.nodes.map(nodeBox);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = 40;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = Math.max(maxX - minX + pad * 2, 1);
  const vbH = Math.max(maxY - minY + pad * 2, 1);

  const centerOf = (id: string) => {
    const n = snapshot.nodes.find((x) => x.id === id);
    if (!n) return null;
    const b = nodeBox(n);
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  };

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className="flex-1 w-full h-full bg-linear-to-br from-gray-50 to-gray-100 thumb-enter"
    >
      {snapshot.edges.map((e) => {
        const s = centerOf(e.source);
        const target = centerOf(e.target);
        if (!s || !target) return null;
        return (
          <line
            key={e.id}
            x1={s.cx}
            y1={s.cy}
            x2={target.cx}
            y2={target.cy}
            stroke="#94a3b8"
            strokeWidth={3}
          />
        );
      })}
      {snapshot.nodes.map((n, i) => {
        const b = boxes[i];
        const isAgg = n.type === 'aggregate';
        const color = NODE_COLORS[n.type] ?? '#94a3b8';
        return (
          <rect
            key={n.id}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={12}
            fill={isAgg ? 'none' : color}
            fillOpacity={isAgg ? 0 : 0.9}
            stroke={isAgg ? color : 'none'}
            strokeWidth={isAgg ? 4 : 0}
            strokeDasharray={isAgg ? '10 8' : undefined}
          />
        );
      })}
    </svg>
  );
}
