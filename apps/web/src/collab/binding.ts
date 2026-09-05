import type { Edge, Node } from 'reactflow';
import { MarkerType } from 'reactflow';
import * as Y from 'yjs';
import {
  getEdgesMap,
  getNodesMap,
  maxNodeZ,
  orderedNodeIds,
  readEdge,
  readNode,
  writeEdge,
  writeNode,
  type CanvasEdge,
  type CanvasNode,
  type YElement,
} from '@esbuddy/sdk';

/*
 * Two-way binding between the shared Y.Doc (schema in @esbuddy/sdk `ydoc.ts`)
 * and React Flow's `nodes` / `edges` arrays.
 *
 *   React → Y   applyNodesToDoc / applyEdgesToDoc
 *     The editor keeps its pure `prev => next` transforms; we diff the two
 *     arrays and write only the *persisted* fields that changed, in one
 *     transaction tagged LOCAL_ORIGIN. Transient React Flow state (selected,
 *     dragging, measured width/height…) never reaches the doc.
 *
 *   Y → React   nodesFromDoc / edgesFromDoc
 *     Rebuild the arrays from the doc in stacking order, carrying the
 *     transient fields over from the previous array by id. Unchanged nodes
 *     keep their object identity so memoised node components don't re-render.
 */

/** Transaction origin for edits made by this client's editor. */
export const LOCAL_ORIGIN = Symbol('esbuddy-local');

const DEFAULT_AGGREGATE_SIZE = { width: 400, height: 260 };
const DEFAULT_EDGE_MARKER = { type: MarkerType.ArrowClosed };

// ---------- CanvasNode <-> React Flow Node ----------

export function toFlowNode(n: CanvasNode): Node {
  const hasSize = typeof n.width === 'number' && typeof n.height === 'number';
  return {
    id: n.id,
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    data: { ...n.data },
    ...(hasSize
      ? { style: { width: n.width, height: n.height } }
      : n.type === 'aggregate'
        ? { style: { ...DEFAULT_AGGREGATE_SIZE } }
        : {}),
  };
}

export function fromFlowNode(n: Node): CanvasNode {
  const w = n.style?.width;
  const h = n.style?.height;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.data ?? {})) if (v !== undefined) data[k] = v;
  return {
    id: n.id,
    type: n.type ?? 'event',
    position: { x: n.position.x, y: n.position.y },
    ...(typeof w === 'number' ? { width: w } : {}),
    ...(typeof h === 'number' ? { height: h } : {}),
    data,
  };
}

export function toFlowEdge(e: CanvasEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    markerEnd: DEFAULT_EDGE_MARKER,
  };
}

export function fromFlowEdge(e: Edge): CanvasEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  };
}

function sameNode(a: CanvasNode, b: CanvasNode): boolean {
  return (
    a.type === b.type &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.width === b.width &&
    a.height === b.height &&
    sameData(a.data, b.data)
  );
}

function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

function sameEdge(a: CanvasEdge, b: CanvasEdge): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    (a.sourceHandle ?? null) === (b.sourceHandle ?? null) &&
    (a.targetHandle ?? null) === (b.targetHandle ?? null)
  );
}

// ---------- Y -> React ----------

/** Transient React Flow fields worth preserving across a rebuild. */
function carryTransient(next: Node, prev: Node): Node {
  return {
    ...next,
    ...(prev.selected !== undefined ? { selected: prev.selected } : {}),
    ...(prev.dragging !== undefined ? { dragging: prev.dragging } : {}),
    ...(prev.width !== undefined ? { width: prev.width } : {}),
    ...(prev.height !== undefined ? { height: prev.height } : {}),
    ...(prev.resizing !== undefined ? { resizing: prev.resizing } : {}),
  };
}

export function nodesFromDoc(doc: Y.Doc, prev: Node[]): Node[] {
  const ynodes = getNodesMap(doc);
  const prevById = new Map(prev.map((n) => [n.id, n]));
  return orderedNodeIds(ynodes).map((id) => {
    const cn = readNode(id, ynodes.get(id)!);
    const p = prevById.get(id);
    if (p && sameNode(cn, fromFlowNode(p))) return p;
    const fn = toFlowNode(cn);
    return p ? carryTransient(fn, p) : fn;
  });
}

export function edgesFromDoc(doc: Y.Doc, prev: Edge[]): Edge[] {
  const yedges = getEdgesMap(doc);
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const out: Edge[] = [];
  yedges.forEach((y, id) => {
    const ce = readEdge(id, y);
    const p = prevById.get(id);
    if (p && sameEdge(ce, fromFlowEdge(p))) {
      out.push(p);
      return;
    }
    const fe = toFlowEdge(ce);
    out.push(p ? { ...fe, selected: p.selected } : fe);
  });
  // Deterministic order (Y.Map iteration order is not guaranteed across peers).
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

// ---------- React -> Y ----------

function setIfChanged(y: YElement, key: string, value: unknown): boolean {
  if (y.get(key) === value) return false;
  y.set(key, value);
  return true;
}

function updateNodeFields(y: YElement, n: CanvasNode): boolean {
  let changed = false;
  changed = setIfChanged(y, 'type', n.type) || changed;
  changed = setIfChanged(y, 'x', n.position.x) || changed;
  changed = setIfChanged(y, 'y', n.position.y) || changed;
  changed = setIfChanged(y, 'w', n.width ?? null) || changed;
  changed = setIfChanged(y, 'h', n.height ?? null) || changed;

  let data = y.get('data');
  if (!(data instanceof Y.Map)) {
    data = new Y.Map<unknown>();
    y.set('data', data);
    changed = true;
  }
  const ydata = data as Y.Map<unknown>;
  for (const [k, v] of Object.entries(n.data)) changed = setIfChanged(ydata, k, v) || changed;
  for (const k of Array.from(ydata.keys())) {
    if (!(k in n.data)) {
      ydata.delete(k);
      changed = true;
    }
  }
  return changed;
}

function updateEdgeFields(y: YElement, e: CanvasEdge): boolean {
  let changed = false;
  changed = setIfChanged(y, 'source', e.source) || changed;
  changed = setIfChanged(y, 'target', e.target) || changed;
  changed = setIfChanged(y, 'sourceHandle', e.sourceHandle ?? null) || changed;
  changed = setIfChanged(y, 'targetHandle', e.targetHandle ?? null) || changed;
  return changed;
}

function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Write the persisted difference between `prev` and `next` into the doc.
 * Stacking: adds are appended (z = max + 1); an explicit reorder (bring to
 * front / send to back / group) re-numbers z for every node.
 * Returns true if the doc changed.
 */
export function applyNodesToDoc(doc: Y.Doc, prev: Node[], next: Node[]): boolean {
  const ynodes = getNodesMap(doc);
  const prevIds = new Set(prev.map((n) => n.id));
  const nextIds = new Set(next.map((n) => n.id));
  let changed = false;

  doc.transact(() => {
    for (const id of prevIds) {
      if (!nextIds.has(id) && ynodes.has(id)) {
        ynodes.delete(id);
        changed = true;
      }
    }

    let maxZ = maxNodeZ(ynodes);
    for (const n of next) {
      const cn = fromFlowNode(n);
      const y = ynodes.get(n.id);
      if (!y) {
        writeNode(ynodes, cn, ++maxZ);
        changed = true;
      } else {
        changed = updateNodeFields(y, cn) || changed;
      }
    }

    const prevOrder = prev.map((n) => n.id).filter((id) => nextIds.has(id));
    const nextOrder = next.map((n) => n.id).filter((id) => prevIds.has(id));
    if (!sameSequence(prevOrder, nextOrder)) {
      next.forEach((n, i) => {
        changed = setIfChanged(ynodes.get(n.id)!, 'z', i) || changed;
      });
    }
  }, LOCAL_ORIGIN);

  return changed;
}

export function applyEdgesToDoc(doc: Y.Doc, prev: Edge[], next: Edge[]): boolean {
  const yedges = getEdgesMap(doc);
  const nextIds = new Set(next.map((e) => e.id));
  let changed = false;

  doc.transact(() => {
    for (const e of prev) {
      if (!nextIds.has(e.id) && yedges.has(e.id)) {
        yedges.delete(e.id);
        changed = true;
      }
    }
    for (const e of next) {
      const ce = fromFlowEdge(e);
      const y = yedges.get(e.id);
      if (!y) {
        writeEdge(yedges, ce);
        changed = true;
      } else {
        changed = updateEdgeFields(y, ce) || changed;
      }
    }
  }, LOCAL_ORIGIN);

  return changed;
}
