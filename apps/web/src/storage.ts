import type { Edge, Node, Viewport } from 'reactflow';
import { EXAMPLE_CANVAS_NAME, exampleCanvasSnapshot } from '@esbuddy/sdk';
import type { ElementType } from './types';

export interface PersistedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: { label: string; type: ElementType; aggregateId: string | null; description: string };
}

export interface PersistedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface PersistedCanvas {
  name: string;
  nodes: PersistedNode[];
  edges: PersistedEdge[];
  viewport: Viewport | null;
}

export interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport | null;
}

interface CanvasStore {
  version: number;
  currentCanvasId: string;
  canvases: Record<string, PersistedCanvas>;
}

const STORAGE_KEY = 'esbuddy.canvas-store';
export const DEFAULT_CANVAS_ID = 'default';

function serializeNodes(nodes: Node[]): PersistedNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'event',
    position: { x: n.position.x, y: n.position.y },
    ...(typeof n.style?.width === 'number' && typeof n.style?.height === 'number'
      ? { width: n.style.width, height: n.style.height }
      : {}),
    data: {
      label: (n.data?.label as string) ?? '',
      type: (n.data?.type as ElementType) ?? (n.type as ElementType) ?? 'event',
      aggregateId: (n.data?.aggregateId as string) ?? null,
      description: (n.data?.description as string) ?? '',
    },
  }));
}

function serializeEdges(edges: Edge[]): PersistedEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
}

function deserializeCanvas(canvas: PersistedCanvas): CanvasSnapshot {
  return {
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      ...(typeof n.width === 'number' && typeof n.height === 'number'
        ? { style: { width: n.width, height: n.height } }
        : n.type === 'aggregate'
          ? { style: { width: 400, height: 260 } }
          : {}),
      data: { ...n.data },
    })),
    edges: canvas.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
    viewport: canvas.viewport,
  };
}

function readStore(): CanvasStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CanvasStore) : null;
  } catch {
    return null;
  }
}

export function loadCanvas(canvasId: string): CanvasSnapshot | null {
  const store = readStore();
  const canvas = store?.canvases[canvasId];
  return canvas ? deserializeCanvas(canvas) : null;
}

export function saveCanvas(
  canvasId: string,
  snapshot: CanvasSnapshot,
  name?: string,
): void {
  try {
    const store = readStore() ?? { version: 1, currentCanvasId: canvasId, canvases: {} };
    store.canvases[canvasId] = {
      name: name ?? store.canvases[canvasId]?.name ?? 'Untitled Canvas',
      nodes: serializeNodes(snapshot.nodes),
      edges: serializeEdges(snapshot.edges),
      viewport: snapshot.viewport,
    };
    store.currentCanvasId = canvasId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota / serialization failures.
  }
}

export function listCanvasIds(): string[] {
  return Object.keys(readStore()?.canvases ?? {});
}

export interface CanvasMeta {
  id: string;
  name: string;
}

export function listCanvases(): CanvasMeta[] {
  const store = readStore();
  if (!store) return [];
  return Object.entries(store.canvases).map(([id, canvas]) => ({ id, name: canvas.name }));
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
    const id = `canvas_example_${Date.now()}`;
    saveCanvas(id, exampleCanvasSnapshot() as unknown as CanvasSnapshot, EXAMPLE_CANVAS_NAME);
    localStorage.setItem(SEED_FLAG_KEY, '1');
  } catch {
    // ignore storage failures
  }
}

export function createCanvas(name?: string): string {
  const id = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  saveCanvas(id, { nodes: [], edges: [], viewport: null }, name ?? 'Untitled Canvas');
  return id;
}

export function renameCanvas(canvasId: string, name: string): void {
  const store = readStore();
  if (!store || !store.canvases[canvasId]) return;
  store.canvases[canvasId].name = name;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

export function deleteCanvas(canvasId: string): void {
  const store = readStore();
  if (!store) return;
  delete store.canvases[canvasId];
  if (store.currentCanvasId === canvasId) store.currentCanvasId = 'default';
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}
