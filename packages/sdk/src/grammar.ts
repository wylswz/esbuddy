import type { ElementType } from './domain.js';

/*
 * The Event Storming grammar of a canvas (design-level, after Brandolini).
 *
 * A relation between two notes can be written in two ways:
 *   - an edge (directed arrow) — reusable, can point anywhere on the board;
 *   - a binding (one note stuck onto another) — the natural, physical way.
 * Both spell the same relation; the compiler treats them identically. Every
 * other edge is rejected by the editor; every other overlap is rejected by the
 * analyzer before compiling. There is no fuzzy guessing.
 *
 * Bindings are explicit, like aggregate membership: dropping an attacher onto
 * exactly one note it can attach to sets `data.boundTo`; moving the target moves
 * it along, and dropping it off the target unbinds it (`nextBinding`). Geometry
 * only decides *when* the editor binds; the compiler reads `boundTo`, never
 * positions.
 *
 * Aggregate membership is explicit (`data.aggregateId`), never geometric.
 */

export type Relation =
  /** command → event */
  | 'produces'
  /** event → policy */
  | 'triggers'
  /** policy → command, actor → command */
  | 'issues'
  /** event → readmodel */
  | 'updates'
  /** readmodel → command: the data a decision is based on */
  | 'supports'
  /** command → external */
  | 'invokes'
  /** external → event */
  | 'emits'
  /** hotspot → any note (overlap only) */
  | 'annotates'
  /** pivotal tape → event (overlap only): the event is pivotal */
  | 'marks';

export const ELEMENT_TYPES: readonly ElementType[] = [
  'event',
  'command',
  'aggregate',
  'actor',
  'policy',
  'external',
  'hotspot',
  'readmodel',
  'note',
  'pivotal',
];

/**
 * Element types the grammar ignores entirely: free-form notes. They take no
 * edges or bindings, may overlap anything, and never reach the compiled text.
 */
export const OUTSIDE_GRAMMAR: readonly ElementType[] = ['note'];

export function isOutsideGrammar(type: string): boolean {
  return (OUTSIDE_GRAMMAR as readonly string[]).includes(type);
}

export function isElementType(type: string): type is ElementType {
  return (ELEMENT_TYPES as readonly string[]).includes(type);
}

/** Allowed edges: `source → target` ⇒ relation. Anything absent is illegal. */
export const EDGE_RULES: Readonly<Partial<Record<ElementType, Partial<Record<ElementType, Relation>>>>> = {
  command: { event: 'produces', external: 'invokes' },
  event: { policy: 'triggers', readmodel: 'updates' },
  policy: { command: 'issues' },
  actor: { command: 'issues' },
  readmodel: { command: 'supports' },
  external: { event: 'emits' },
};

export function edgeRelation(source: string, target: string): Relation | null {
  if (!isElementType(source) || !isElementType(target)) return null;
  return EDGE_RULES[source]?.[target] ?? null;
}

export function canConnect(source: string, target: string): boolean {
  return edgeRelation(source, target) !== null;
}

/** Whether a note of this type can start / end any edge (drives connection handles). */
export function hasOutgoingEdges(type: string): boolean {
  return isElementType(type) && Object.keys(EDGE_RULES[type] ?? {}).length > 0;
}

export function hasIncomingEdges(type: string): boolean {
  return ELEMENT_TYPES.some((s) => EDGE_RULES[s]?.[type as ElementType]);
}

/**
 * Notes that attach to another note by being stuck onto it. The attacher
 * relates to exactly one note of the listed types; the relation keeps the
 * same direction as the equivalent edge.
 */
export interface OverlapRule {
  relation: Relation;
  /** Types the attacher may be stuck onto. */
  targets: readonly ElementType[];
  /** Direction of the resulting relation relative to the attacher. */
  direction: 'from-attacher' | 'to-attacher';
}

const ANNOTATABLE: readonly ElementType[] = ['event', 'command', 'actor', 'policy', 'external', 'readmodel'];

export const OVERLAP_RULES: Readonly<Partial<Record<ElementType, OverlapRule>>> = {
  actor: { relation: 'issues', targets: ['command'], direction: 'from-attacher' },
  // A read model stuck on a command is the data that decision is based on. Arrows
  // *into* a read model (event → read model) are what update it.
  readmodel: { relation: 'supports', targets: ['command'], direction: 'from-attacher' },
  hotspot: { relation: 'annotates', targets: ANNOTATABLE, direction: 'from-attacher' },
  // A strip of tape across an event marks it as pivotal: the timeline splits there.
  pivotal: { relation: 'marks', targets: ['event'], direction: 'from-attacher' },
};

/**
 * Tape is a long, thin strip laid across the board: crossing notes other than
 * the ones it can mark means nothing and is not an overlap.
 */
export function overlapCounts(a: { type: string }, b: { type: string }): boolean {
  const [tape, other] = a.type === 'pivotal' ? [a, b] : b.type === 'pivotal' ? [b, a] : [null, null];
  return !tape || canBind(tape.type, other.type);
}

/** Whether an attacher of this type may be bound to a note (or, for hot spots, an aggregate) of that type. */
export function canBind(attacherType: string, targetType: string): boolean {
  const rule = isElementType(attacherType) ? OVERLAP_RULES[attacherType] : undefined;
  if (!rule) return false;
  return rule.targets.includes(targetType as ElementType) || (attacherType === 'hotspot' && targetType === 'aggregate');
}

/** The relation a binding spells, oriented like the equivalent edge. */
export function bindingRelation(
  attacher: { id: string; type: string },
  target: { id: string; type: string },
): { relation: Relation; source: string; target: string } | null {
  if (!canBind(attacher.type, target.type)) return null;
  const rule = OVERLAP_RULES[attacher.type as ElementType]!;
  const [source, tgt] = rule.direction === 'from-attacher' ? [attacher.id, target.id] : [target.id, attacher.id];
  return { relation: rule.relation, source, target: tgt };
}

/** The meaningful reading of two overlapping notes, or null if the overlap means nothing. */
export function overlapRelation(
  a: { id: string; type: string },
  b: { id: string; type: string },
): { relation: Relation; attacher: string; source: string; target: string } | null {
  for (const [att, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const rule = isElementType(att.type) ? OVERLAP_RULES[att.type] : undefined;
    if (!rule || !rule.targets.includes(other.type as ElementType)) continue;
    const [source, target] = rule.direction === 'from-attacher' ? [att.id, other.id] : [other.id, att.id];
    return { relation: rule.relation, attacher: att.id, source, target };
  }
  return null;
}

// ---------- Geometry ----------

export const NOTE_DEFAULT_SIZE = 180;

export const ELEMENT_DEFAULT_SIZE: Partial<Record<ElementType, { width: number; height: number }>> = {
  actor: { width: 140, height: 100 },
  // Groups get a real box from their members; this only covers one stored without a size.
  aggregate: { width: 400, height: 260 },
  // A vertical strip of tape, longer than the event it is stuck across.
  pivotal: { width: 36, height: 300 },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Anything with a position and a size: a persisted `CanvasNode`, or a React
 * Flow node (measured `width`/`height`, else `style`).
 */
export interface PlacedNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  style?: { width?: unknown; height?: unknown };
  data?: Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function nodeRect(n: PlacedNode): Rect {
  const fallback = ELEMENT_DEFAULT_SIZE[n.type as ElementType] ?? { width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE };
  return {
    x: n.position.x,
    y: n.position.y,
    w: num(n.width) ?? num(n.style?.width) ?? fallback.width,
    h: num(n.height) ?? num(n.style?.height) ?? fallback.height,
  };
}

/** Strict intersection: notes that merely touch along an edge do not overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// ---------- Bindings ----------

export function boundToOf(n: { data?: Record<string, unknown> }): string | null {
  const b = n.data?.boundTo;
  return typeof b === 'string' && b ? b : null;
}

/** The note a group hangs from: follow `boundTo` until a note that isn't bound. */
export function bindingRoot(id: string, byId: ReadonlyMap<string, { data?: Record<string, unknown> }>): string {
  let cur = id;
  for (let i = 0; i < 8; i++) {
    const next = boundToOf(byId.get(cur) ?? {});
    if (!next || !byId.has(next)) break;
    cur = next;
  }
  return cur;
}

/**
 * Where an attacher would bind if dropped where it is now: the single note it
 * overlaps and may attach to (a hot spot over no note may bind to the single
 * aggregate under it). Zero or several candidates ⇒ null; the editor never
 * picks one for the user.
 */
export function bindingTarget(attacher: PlacedNode, nodes: readonly PlacedNode[]): string | null {
  const type = attacher.type ?? '';
  if (!isElementType(type) || !OVERLAP_RULES[type]) return null;
  const rect = nodeRect(attacher);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const under = nodes.filter(
    (n) =>
      n.id !== attacher.id &&
      // Never bind into a cycle (onto a note hanging from this one).
      bindingRoot(n.id, byId) !== attacher.id &&
      rectsOverlap(rect, nodeRect(n)),
  );
  const notes = under.filter((n) => n.type !== 'aggregate' && canBind(type, n.type ?? ''));
  if (notes.length > 0) return notes.length === 1 ? notes[0].id : null;
  const aggs = under.filter((n) => n.type === 'aggregate' && canBind(type, 'aggregate'));
  return aggs.length === 1 ? aggs[0].id : null;
}

/**
 * The binding an attacher should have after being dropped where it is: it keeps
 * its current target while it still overlaps it; moved off, it unbinds — or
 * rebinds to the single new note it was dropped onto (`bindingTarget`).
 */
export function nextBinding(attacher: PlacedNode, nodes: readonly PlacedNode[]): string | null {
  const current = nodes.find((n) => n.id === boundToOf(attacher));
  if (current && canBind(attacher.type ?? '', current.type ?? '') && rectsOverlap(nodeRect(attacher), nodeRect(current))) {
    return current.id;
  }
  return bindingTarget(attacher, nodes);
}
