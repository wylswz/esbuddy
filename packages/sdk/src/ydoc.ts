import * as Y from 'yjs';
import type { CanvasEdge, CanvasNode, CanvasSnapshot } from './domain.js';

/*
 * Canvas CRDT schema (shared by the web editor, the Node room host and the
 * Cloudflare Durable Object). A canvas is one Y.Doc:
 *
 *   doc.getMap('nodes'): Y.Map<nodeId, Y.Map<field, value>>
 *   doc.getMap('edges'): Y.Map<edgeId, Y.Map<field, value>>
 *
 * Node fields: type, x, y, w, h, z, data (nested Y.Map of arbitrary keys).
 * Edge fields: source, target, sourceHandle, targetHandle.
 *
 * Every element is its own Y.Map so concurrent edits to *different fields* of
 * the same note (one user drags it, another retypes its label) both survive;
 * only same-field writes fall back to last-writer-wins.
 *
 * Stacking order is a per-node numeric `z` rather than array position: the
 * editor sorts by (aggregates first, z, id). Aggregates always render behind
 * notes — the domain invariant the editor already enforced via array order.
 *
 * The viewport is deliberately NOT part of the shared doc: pan/zoom is per
 * user, so it lives in each client's local storage.
 */

export const Y_NODES = 'nodes';
export const Y_EDGES = 'edges';

export type YElement = Y.Map<unknown>;
export type YElements = Y.Map<YElement>;

export function getNodesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_NODES);
}

export function getEdgesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_EDGES);
}

export function isDocEmpty(doc: Y.Doc): boolean {
  return getNodesMap(doc).size === 0 && getEdgesMap(doc).size === 0;
}

/** Loosely-typed node as it may arrive from legacy snapshots (React Flow `style`). */
type LooseNode = CanvasNode & { style?: { width?: unknown; height?: unknown } };

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nodeSize(n: LooseNode): { w: number | null; h: number | null } {
  return {
    w: numOrNull(n.width) ?? numOrNull(n.style?.width),
    h: numOrNull(n.height) ?? numOrNull(n.style?.height),
  };
}

/** Write (or fully overwrite) a node into the nodes map. */
export function writeNode(nodes: YElements, node: CanvasNode, z: number): void {
  const y = new Y.Map<unknown>();
  const data = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(node.data ?? {})) if (v !== undefined) data.set(k, v);
  const { w, h } = nodeSize(node);
  y.set('type', node.type);
  y.set('x', node.position.x);
  y.set('y', node.position.y);
  y.set('w', w);
  y.set('h', h);
  y.set('z', z);
  y.set('data', data);
  nodes.set(node.id, y);
}

export function writeEdge(edges: YElements, edge: CanvasEdge): void {
  const y = new Y.Map<unknown>();
  y.set('source', edge.source);
  y.set('target', edge.target);
  y.set('sourceHandle', edge.sourceHandle ?? null);
  y.set('targetHandle', edge.targetHandle ?? null);
  edges.set(edge.id, y);
}

export function readNodeZ(y: YElement): number {
  return numOrNull(y.get('z')) ?? 0;
}

export function readNode(id: string, y: YElement): CanvasNode {
  const data = y.get('data');
  const w = numOrNull(y.get('w'));
  const h = numOrNull(y.get('h'));
  return {
    id,
    type: String(y.get('type') ?? 'event'),
    position: { x: numOrNull(y.get('x')) ?? 0, y: numOrNull(y.get('y')) ?? 0 },
    ...(w !== null ? { width: w } : {}),
    ...(h !== null ? { height: h } : {}),
    data: data instanceof Y.Map ? (data.toJSON() as Record<string, unknown>) : {},
  };
}

export function readEdge(id: string, y: YElement): CanvasEdge {
  const sh = y.get('sourceHandle');
  const th = y.get('targetHandle');
  return {
    id,
    source: String(y.get('source') ?? ''),
    target: String(y.get('target') ?? ''),
    sourceHandle: typeof sh === 'string' ? sh : null,
    targetHandle: typeof th === 'string' ? th : null,
  };
}

/** Stacking comparator: aggregates behind everything, then by z, then id for determinism. */
export function compareNodeOrder(
  a: { id: string; type: string; z: number },
  b: { id: string; type: string; z: number },
): number {
  const ta = a.type === 'aggregate' ? 0 : 1;
  const tb = b.type === 'aggregate' ? 0 : 1;
  if (ta !== tb) return ta - tb;
  if (a.z !== b.z) return a.z - b.z;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Node ids in render (stacking) order. */
export function orderedNodeIds(nodes: YElements): string[] {
  const entries: { id: string; type: string; z: number }[] = [];
  nodes.forEach((y, id) => entries.push({ id, type: String(y.get('type') ?? ''), z: readNodeZ(y) }));
  return entries.sort(compareNodeOrder).map((e) => e.id);
}

export function maxNodeZ(nodes: YElements): number {
  let max = -1;
  nodes.forEach((y) => {
    max = Math.max(max, readNodeZ(y));
  });
  return max;
}

/**
 * Replace the doc's content with a snapshot (used to seed a fresh doc from the
 * example board or to migrate a legacy JSON canvas). Array order becomes `z`.
 */
export function snapshotToDoc(snapshot: CanvasSnapshot, doc: Y.Doc, origin?: unknown): void {
  const nodes = getNodesMap(doc);
  const edges = getEdgesMap(doc);
  doc.transact(() => {
    nodes.clear();
    edges.clear();
    snapshot.nodes.forEach((n, i) => writeNode(nodes, n, i));
    snapshot.edges.forEach((e) => writeEdge(edges, e));
  }, origin);
}

/** Materialise the doc as a plain snapshot (viewport is per-user, so null). */
export function docToSnapshot(doc: Y.Doc): CanvasSnapshot {
  const nodes = getNodesMap(doc);
  const edges = getEdgesMap(doc);
  const nodeList = orderedNodeIds(nodes).map((id) => readNode(id, nodes.get(id)!));
  const edgeList: CanvasEdge[] = [];
  edges.forEach((y, id) => edgeList.push(readEdge(id, y)));
  edgeList.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes: nodeList, edges: edgeList, viewport: null };
}

/** Build a new doc from a snapshot. */
export function docFromSnapshot(snapshot: CanvasSnapshot): Y.Doc {
  const doc = new Y.Doc();
  snapshotToDoc(snapshot, doc);
  return doc;
}
