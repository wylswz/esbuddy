import type { Viewport } from 'reactflow';

// Pan/zoom is per user, not part of the shared document, so it is remembered
// per canvas in this browser only.

const PREFIX = 'esbuddy.viewport.';

export function loadViewport(canvasId: string): Viewport | null {
  try {
    const raw = localStorage.getItem(PREFIX + canvasId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Viewport;
    return typeof v?.x === 'number' && typeof v?.y === 'number' && typeof v?.zoom === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveViewport(canvasId: string, viewport: Viewport): void {
  try {
    localStorage.setItem(PREFIX + canvasId, JSON.stringify(viewport));
  } catch {
    // ignore quota errors
  }
}
