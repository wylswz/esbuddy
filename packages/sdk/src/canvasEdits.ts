import * as Y from 'yjs';
import type { CanvasEdits } from './agent.js';
import type { CanvasEdge, CanvasNode } from './domain.js';
import { canBind, canConnect, nodeRect } from './grammar.js';
import { docToSnapshot, getEdgesMap, getNodesMap, writeEdge, writeNode } from './ydoc.js';

export class CanvasEditError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message);
    this.name = 'CanvasEditError';
  }
}

/** A snapshot contains both clocks and the delete set; state vectors alone miss deletions. */
export function canvasRevision(doc: Y.Doc): string {
  return btoa(Array.from(Y.encodeSnapshot(Y.snapshot(doc)), (byte) => String.fromCharCode(byte)).join(''));
}

function fail(message: string): never {
  throw new CanvasEditError(message, 400);
}

function conflict(message: string): never {
  throw new CanvasEditError(message, 409);
}

function move(nodes: Map<string, CanvasNode>, id: string, dx: number, dy: number): void {
  const moved = new Set<string>();
  const visit = (nodeId: string) => {
    if (moved.has(nodeId)) return;
    moved.add(nodeId);
    const node = nodes.get(nodeId)!;
    node.position = { x: node.position.x + dx, y: node.position.y + dy };
    for (const child of nodes.values()) {
      if (child.data.boundTo === nodeId || (node.type === 'aggregate' && child.data.aggregateId === nodeId)) visit(child.id);
    }
  };
  visit(id);
}

function removeNode(nodes: Map<string, CanvasNode>, edges: Map<string, CanvasEdge>, id: string): void {
  nodes.delete(id);
  for (const [edgeId, edge] of edges) if (edge.source === id || edge.target === id) edges.delete(edgeId);
  for (const node of nodes.values()) {
    if (node.data.boundTo === id) delete node.data.boundTo;
    if (node.data.aggregateId === id) delete node.data.aggregateId;
  }
}

function validateRelations(nodes: Map<string, CanvasNode>, edges: Map<string, CanvasEdge>): void {
  for (const node of nodes.values()) {
    const aggregateId = node.data.aggregateId;
    if (aggregateId != null && (typeof aggregateId !== 'string' || nodes.get(aggregateId)?.type !== 'aggregate'
      || (node.type !== 'event' && node.type !== 'command'))) fail(`Invalid aggregate membership on ${node.id}`);
    const boundTo = node.data.boundTo;
    if (boundTo != null) {
      const target = typeof boundTo === 'string' ? nodes.get(boundTo) : undefined;
      if (!target || !canBind(node.type, target.type)) fail(`Invalid binding on ${node.id}`);
      const seen = new Set([node.id]);
      let current: CanvasNode | undefined = target;
      while (current) {
        if (seen.has(current.id)) fail(`Binding cycle on ${node.id}`);
        seen.add(current.id);
        current = typeof current.data.boundTo === 'string' ? nodes.get(current.data.boundTo) : undefined;
      }
    }
  }
  for (const edge of edges.values()) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target || !canConnect(source.type, target.type)) fail(`Invalid edge ${edge.id}`);
  }
}

function fitAggregates(nodes: Map<string, CanvasNode>, edges: Map<string, CanvasEdge>, added: Set<string>): void {
  for (const aggregate of Array.from(nodes.values()).filter((node) => node.type === 'aggregate')) {
    const children = Array.from(nodes.values()).filter((node) => node.data.aggregateId === aggregate.id);
    if (!children.length) {
      if (added.has(aggregate.id)) fail(`New aggregate ${aggregate.id} requires event/command members in the same batch`);
      removeNode(nodes, edges, aggregate.id);
      continue;
    }
    const rect = nodeRect(aggregate);
    const bounds = children.map(nodeRect);
    const x = Math.min(rect.x, ...bounds.map((b) => b.x - 24));
    const y = Math.min(rect.y, ...bounds.map((b) => b.y - 36));
    const right = Math.max(rect.x + rect.w, ...bounds.map((b) => b.x + b.w + 24));
    const bottom = Math.max(rect.y + rect.h, ...bounds.map((b) => b.y + b.h + 24));
    aggregate.position = { x, y };
    aggregate.width = right - x;
    aggregate.height = bottom - y;
  }
}

/**
 * Plan and validate against a copy first: a Yjs transaction batches notifications
 * but does not roll back when a callback throws. Only then patch changed fields.
 */
export function applyCanvasEdits(doc: Y.Doc, edits: CanvasEdits): void {
  if (edits.expectedRevision !== undefined && edits.expectedRevision !== canvasRevision(doc)) {
    conflict('Canvas changed; read it again before editing');
  }
  const before = docToSnapshot(doc);
  const nodes = new Map(before.nodes.map((node) => [node.id, {
    ...node, position: { ...node.position }, data: { ...node.data },
  }]));
  const edges = new Map(before.edges.map((edge) => [edge.id, { ...edge }]));
  const added = new Set<string>();
  const usedNodeIds = new Set(nodes.keys());
  const usedEdgeIds = new Set(edges.keys());
  for (const operation of edits.operations) {
    switch (operation.op) {
      case 'add_node': {
        if (usedNodeIds.has(operation.id)) conflict(`Node ID already exists: ${operation.id}`);
        usedNodeIds.add(operation.id);
        const { id, type, position, width, height, label, description, boundTo, aggregateId } = operation;
        nodes.set(id, {
          id, type, position: { ...position }, width, height,
          data: {
            type, label,
            ...(description !== undefined ? { description } : {}),
            ...(boundTo !== undefined ? { boundTo } : {}),
            ...(aggregateId !== undefined ? { aggregateId } : {}),
          },
        });
        added.add(id);
        break;
      }
      case 'update_node': {
        const node = nodes.get(operation.id);
        if (!node) conflict(`Node no longer exists: ${operation.id}`);
        const patch = operation.patch;
        if (patch.position) {
          move(nodes, node.id, patch.position.x - node.position.x, patch.position.y - node.position.y);
          if (patch.boundTo === undefined) delete node.data.boundTo;
        }
        if (patch.width !== undefined) node.width = patch.width;
        if (patch.height !== undefined) node.height = patch.height;
        for (const key of ['label', 'description', 'boundTo', 'aggregateId'] as const) {
          if (patch[key] === null) delete node.data[key];
          else if (patch[key] !== undefined) node.data[key] = patch[key];
        }
        break;
      }
      case 'delete_node':
        if (!nodes.has(operation.id)) conflict(`Node no longer exists: ${operation.id}`);
        removeNode(nodes, edges, operation.id);
        break;
      case 'add_edge':
        if (usedEdgeIds.has(operation.id)) conflict(`Edge ID already exists: ${operation.id}`);
        usedEdgeIds.add(operation.id);
        edges.set(operation.id, { id: operation.id, source: operation.source, target: operation.target });
        break;
      case 'delete_edge':
        if (!edges.has(operation.id)) conflict(`Edge no longer exists: ${operation.id}`);
        edges.delete(operation.id);
        break;
    }
  }
  validateRelations(nodes, edges);
  fitAggregates(nodes, edges, added);

  const oldNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const yNodes = getNodesMap(doc);
  const yEdges = getEdgesMap(doc);
  let z = 0;
  for (const node of yNodes.values()) z = Math.max(z, Number(node.get('z')) || 0);
  doc.transact(() => {
    for (const id of yNodes.keys()) if (!nodes.has(id)) yNodes.delete(id);
    for (const [id, node] of nodes) {
      const old = oldNodes.get(id);
      if (!old) {
        writeNode(yNodes, node, ++z);
        continue;
      }
      const target = yNodes.get(id)!;
      if (old.position.x !== node.position.x) target.set('x', node.position.x);
      if (old.position.y !== node.position.y) target.set('y', node.position.y);
      if (old.width !== node.width) target.set('w', node.width ?? null);
      if (old.height !== node.height) target.set('h', node.height ?? null);
      const data = target.get('data') as Y.Map<unknown>;
      for (const key of Object.keys(old.data)) if (!(key in node.data)) data.delete(key);
      for (const [key, value] of Object.entries(node.data)) if (!Object.is(value, old.data[key])) data.set(key, value);
    }
    for (const id of yEdges.keys()) if (!edges.has(id)) yEdges.delete(id);
    for (const [id, edge] of edges) if (!yEdges.has(id)) writeEdge(yEdges, edge);
  }, 'agent-api');
}
