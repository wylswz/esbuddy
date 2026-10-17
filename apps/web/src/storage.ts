import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot, type CanvasSnapshot } from '@esbuddy/sdk';
import { newId } from './ids';

/*
 * Local-mode canvas list in localStorage: names plus a materialised snapshot
 * (written by the local collab provider) for the gallery thumbnails. Canvas
 * content itself lives in IndexedDB (see collab/provider.ts). Entries written
 * by older builds have the same node/edge shape, so they read back unchanged.
 */

interface PersistedCanvas extends CanvasSnapshot {
  name: string;
}

interface CanvasStore {
  version: number;
  canvases: Record<string, PersistedCanvas>;
}

const STORAGE_KEY = 'esbuddy.canvas-store';
const UNTITLED = 'Untitled Canvas';

function readStore(): CanvasStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CanvasStore) : null;
  } catch {
    return null;
  }
}

function writeStore(store: CanvasStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota / serialization failures.
  }
}

export function loadCanvas(canvasId: string): CanvasSnapshot | null {
  const canvas = readStore()?.canvases[canvasId];
  if (!canvas) return null;
  const { nodes, edges, viewport, structure, votes } = canvas;
  return { nodes, edges, viewport: viewport ?? null, ...(structure ? { structure } : {}), ...(votes ? { votes } : {}) };
}

export function saveCanvas(canvasId: string, snapshot: CanvasSnapshot, name?: string): void {
  const store = readStore() ?? { version: 1, canvases: {} };
  store.canvases[canvasId] = { ...snapshot, name: name ?? store.canvases[canvasId]?.name ?? UNTITLED };
  writeStore(store);
}

export interface CanvasMeta {
  id: string;
  name: string;
}

export function listCanvases(): CanvasMeta[] {
  return Object.entries(readStore()?.canvases ?? {}).map(([id, canvas]) => ({ id, name: canvas.name }));
}

const SEED_FLAG_KEY = 'esbuddy.example-seeded';

/**
 * Seed the worked DDD example once (guarded by a flag), so the local gallery
 * isn't empty on first visit. The flag means we never re-add it after the user
 * deletes it.
 */
export function ensureExampleSeed(): void {
  try {
    if (localStorage.getItem(SEED_FLAG_KEY)) return;
    saveCanvas(newId('canvas_example'), exampleCanvasSnapshot(), EXAMPLE_CANVAS_NAME);
    localStorage.setItem(SEED_FLAG_KEY, '1');
  } catch {
    // ignore storage failures
  }
}

export function createCanvas(name?: string): string {
  const id = newId('canvas');
  saveCanvas(id, { nodes: [], edges: [], viewport: null }, name ?? UNTITLED);
  return id;
}

export function renameCanvas(canvasId: string, name: string): void {
  const store = readStore();
  if (!store?.canvases[canvasId]) return;
  store.canvases[canvasId].name = name;
  writeStore(store);
}

export function deleteCanvas(canvasId: string): void {
  const store = readStore();
  if (!store) return;
  delete store.canvases[canvasId];
  writeStore(store);
}
