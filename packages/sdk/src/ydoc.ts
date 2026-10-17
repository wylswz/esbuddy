import * as Y from 'yjs';
import type {
  CanvasEdge,
  CanvasLane,
  CanvasMilestone,
  CanvasNode,
  CanvasSnapshot,
  CanvasStructure,
  CanvasVote,
} from './domain.js';

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
 * Board structure (visual only, never compiled) lives beside the notes:
 *
 *   doc.getMap('lanes'):      Y.Map<laneId, Y.Map{label, y, height}>
 *   doc.getMap('milestones'): Y.Map<milestoneId, Y.Map{label, x}>
 *
 * Dot votes on hot spots (visual only, never compiled), one entry per voter
 * per note so concurrent votes never overwrite each other:
 *
 *   doc.getMap('votes'): Y.Map<`${nodeId} ${userId}`, {nodeId, userId, name}>
 *
 * A vote outlives its note's deletion (undoing the delete brings both back);
 * snapshots only carry votes on hot spots that exist.
 *
 * The viewport is deliberately NOT part of the shared doc: pan/zoom is per
 * user, so it lives in each client's local storage.
 */

export const Y_NODES = 'nodes';
export const Y_EDGES = 'edges';
export const Y_LANES = 'lanes';
export const Y_MILESTONES = 'milestones';
export const Y_VOTES = 'votes';

export type YElement = Y.Map<unknown>;
export type YElements = Y.Map<YElement>;

export function getNodesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_NODES);
}

export function getEdgesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_EDGES);
}

export function getLanesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_LANES);
}

export function getMilestonesMap(doc: Y.Doc): YElements {
  return doc.getMap<YElement>(Y_MILESTONES);
}

export function getVotesMap(doc: Y.Doc): Y.Map<CanvasVote> {
  return doc.getMap<CanvasVote>(Y_VOTES);
}

/** Every shared type holding canvas content (for undo tracking and observers). */
export function contentTypes(doc: Y.Doc): YElements[] {
  return [getNodesMap(doc), getEdgesMap(doc), getLanesMap(doc), getMilestonesMap(doc)];
}

export function isDocEmpty(doc: Y.Doc): boolean {
  return contentTypes(doc).every((m) => m.size === 0);
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

/** Write (or fully overwrite) a lane. Edits patch fields of the existing Y.Map instead. */
export function writeLane(lanes: YElements, lane: CanvasLane): void {
  const y = new Y.Map<unknown>();
  y.set('label', lane.label);
  y.set('y', lane.y);
  y.set('height', lane.height);
  lanes.set(lane.id, y);
}

export function writeMilestone(milestones: YElements, m: CanvasMilestone): void {
  const y = new Y.Map<unknown>();
  y.set('label', m.label);
  y.set('x', m.x);
  milestones.set(m.id, y);
}

const byIdOrder = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Lanes top to bottom, milestones left to right. */
export function readStructure(doc: Y.Doc): CanvasStructure {
  const lanes: CanvasLane[] = [];
  getLanesMap(doc).forEach((y, id) =>
    lanes.push({
      id,
      label: String(y.get('label') ?? ''),
      y: numOrNull(y.get('y')) ?? 0,
      height: Math.max(numOrNull(y.get('height')) ?? 0, 0),
    }),
  );
  const milestones: CanvasMilestone[] = [];
  getMilestonesMap(doc).forEach((y, id) =>
    milestones.push({ id, label: String(y.get('label') ?? ''), x: numOrNull(y.get('x')) ?? 0 }),
  );
  lanes.sort((a, b) => a.y - b.y || byIdOrder(a, b));
  milestones.sort((a, b) => a.x - b.x || byIdOrder(a, b));
  return { lanes, milestones };
}

export function isStructureEmpty(s: CanvasStructure | undefined | null): boolean {
  return !s || (s.lanes.length === 0 && s.milestones.length === 0);
}

/** Only hot spots take votes: the workshop votes on which problem to tackle next. */
export function isVotable(type: string | undefined): boolean {
  return type === 'hotspot';
}

const voteKey = (nodeId: string, userId: string) => `${nodeId} ${userId}`;

function parseVote(v: unknown): CanvasVote | null {
  if (!v || typeof v !== 'object') return null;
  const { nodeId, userId, name } = v as Record<string, unknown>;
  return typeof nodeId === 'string' && typeof userId === 'string'
    ? { nodeId, userId, name: typeof name === 'string' ? name : '' }
    : null;
}

function writeVote(votes: Y.Map<CanvasVote>, vote: CanvasVote): void {
  votes.set(voteKey(vote.nodeId, vote.userId), { nodeId: vote.nodeId, userId: vote.userId, name: vote.name });
}

/** Every vote in the doc, including ones on deleted notes, in a stable order. */
export function readVotes(doc: Y.Doc): CanvasVote[] {
  const out: CanvasVote[] = [];
  getVotesMap(doc).forEach((v) => {
    const vote = parseVote(v);
    if (vote) out.push(vote);
  });
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return out.sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.name, b.name) || cmp(a.userId, b.userId));
}

/** Cast `voter`'s vote on a note, or take it back if already cast. */
export function toggleVote(doc: Y.Doc, nodeId: string, voter: { id: string; name: string }, origin?: unknown): void {
  const votes = getVotesMap(doc);
  const key = voteKey(nodeId, voter.id);
  doc.transact(() => {
    if (votes.has(key)) votes.delete(key);
    else writeVote(votes, { nodeId, userId: voter.id, name: voter.name });
  }, origin);
}

export function clearVotes(doc: Y.Doc, origin?: unknown): void {
  doc.transact(() => getVotesMap(doc).clear(), origin);
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
  const [nodes, edges, lanes, milestones] = contentTypes(doc);
  const votes = getVotesMap(doc);
  doc.transact(() => {
    for (const m of [nodes, edges, lanes, milestones]) m.clear();
    votes.clear();
    snapshot.nodes.forEach((n, i) => writeNode(nodes, n, i));
    snapshot.edges.forEach((e) => writeEdge(edges, e));
    snapshot.structure?.lanes?.forEach((l) => writeLane(lanes, l));
    snapshot.structure?.milestones?.forEach((m) => writeMilestone(milestones, m));
    for (const v of snapshot.votes ?? []) {
      const vote = parseVote(v);
      if (vote) writeVote(votes, vote);
    }
  }, origin);
}

/**
 * Materialise the doc as a plain snapshot (viewport is per-user, so null).
 * `structure` is only present when the board has lanes or milestones, `votes`
 * only when a hot spot on the board has any.
 */
export function docToSnapshot(doc: Y.Doc): CanvasSnapshot {
  const nodes = getNodesMap(doc);
  const edges = getEdgesMap(doc);
  const nodeList = orderedNodeIds(nodes).map((id) => readNode(id, nodes.get(id)!));
  const edgeList: CanvasEdge[] = [];
  edges.forEach((y, id) => edgeList.push(readEdge(id, y)));
  edgeList.sort(byIdOrder);
  const structure = readStructure(doc);
  const votes = readVotes(doc).filter((v) => isVotable(nodes.get(v.nodeId)?.get('type') as string | undefined));
  return {
    nodes: nodeList,
    edges: edgeList,
    viewport: null,
    ...(isStructureEmpty(structure) ? {} : { structure }),
    ...(votes.length > 0 ? { votes } : {}),
  };
}

/** Build a new doc from a snapshot. */
export function docFromSnapshot(snapshot: CanvasSnapshot): Y.Doc {
  const doc = new Y.Doc();
  snapshotToDoc(snapshot, doc);
  return doc;
}
