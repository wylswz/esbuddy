import type { CanvasLane } from './domain.js';

/*
 * Swimlane geometry. Lanes never overlap: every edit keeps a lane inside the
 * free gap between its neighbours. (Concurrent edits by two peers could still
 * collide; the editor then simply stops clamping that lane until it is moved
 * clear.)
 */

export const DEFAULT_LANE_HEIGHT = 240;
export const MIN_LANE_HEIGHT = 60;

export interface Gap {
  /** -Infinity when nothing is above. */
  top: number;
  /** Infinity when nothing is below. */
  bottom: number;
}

/** The free vertical interval around `y`, ignoring lane `ignoreId`; null if `y` falls inside a lane. */
export function laneGap(lanes: readonly CanvasLane[], y: number, ignoreId?: string): Gap | null {
  let top = -Infinity;
  let bottom = Infinity;
  for (const l of lanes) {
    if (l.id === ignoreId) continue;
    const end = l.y + l.height;
    if (y >= l.y && y < end) return null;
    if (end <= y) top = Math.max(top, end);
    else bottom = Math.min(bottom, l.y);
  }
  return { top, bottom };
}

/**
 * Where a new lane starting at `y` fits: shortened, or nudged up, to stay in
 * its gap. Null if `y` is inside a lane or the gap is narrower than `minHeight`.
 */
export function placeLane(
  lanes: readonly CanvasLane[],
  y: number,
  height: number,
  minHeight: number,
): { y: number; height: number } | null {
  const gap = laneGap(lanes, y);
  if (!gap || gap.bottom - gap.top < minHeight) return null;
  const top = Math.max(gap.top, Math.min(y, gap.bottom - minHeight));
  return { y: top, height: Math.min(height, gap.bottom - top) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Lane `id` moved to `y`, kept within its gap. */
export function moveLane(lanes: readonly CanvasLane[], id: string, y: number): number {
  const lane = lanes.find((l) => l.id === id);
  const gap = lane && laneGap(lanes, lane.y, id);
  return lane && gap ? clamp(y, gap.top, gap.bottom - lane.height) : y;
}

/** Lane `id` with one edge dragged to `edgeY`, at least `minHeight` tall and within its gap. */
export function resizeLane(
  lanes: readonly CanvasLane[],
  id: string,
  edge: 'top' | 'bottom',
  edgeY: number,
  minHeight: number,
): { y: number; height: number } | null {
  const lane = lanes.find((l) => l.id === id);
  if (!lane) return null;
  const gap = laneGap(lanes, lane.y, id) ?? { top: -Infinity, bottom: Infinity };
  const end = lane.y + lane.height;
  if (edge === 'top') {
    const y = clamp(edgeY, gap.top, end - minHeight);
    return { y, height: end - y };
  }
  return { y: lane.y, height: clamp(edgeY, lane.y + minHeight, Math.max(gap.bottom, lane.y + minHeight)) - lane.y };
}
