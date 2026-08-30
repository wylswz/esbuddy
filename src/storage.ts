import type { Edge, Node, Viewport } from 'reactflow';
import type { ElementType } from './types';

export interface PersistedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: { label: string; type: ElementType; aggregateId: string | null };
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
    ...(n.type === 'aggregate' && typeof n.style?.width === 'number' && typeof n.style?.height === 'number'
      ? { width: n.style.width, height: n.style.height }
      : {}),
    data: {
      label: (n.data?.label as string) ?? '',
      type: (n.data?.type as ElementType) ?? (n.type as ElementType) ?? 'event',
      aggregateId: (n.data?.aggregateId as string) ?? null,
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
      ...(n.type === 'aggregate'
        ? { style: { width: n.width ?? 400, height: n.height ?? 260 } }
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
