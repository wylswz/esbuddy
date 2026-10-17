import type { CanvasNode } from '../domain.js';
import {
  bindingRelation,
  bindingRoot,
  boundToOf,
  edgeRelation,
  isElementType,
  isOutsideGrammar,
  nodeRect,
  overlapCounts,
  rectsOverlap,
  type Relation,
} from '../grammar.js';
import type { CanvasInput, CheckContext, Overlap, ResolvedRelation } from './types.js';

export function labelOf(n: CanvasNode): string {
  const l = n.data?.label;
  return typeof l === 'string' ? l.replace(/\s+/g, ' ').trim() : '';
}

export function aggregateIdOf(n: CanvasNode): string | null {
  const a = n.data?.aggregateId;
  return typeof a === 'string' && a ? a : null;
}

/** Relations spelled by legal edges and legal bindings; illegal ones are skipped here. */
export function resolveRelations({ nodes, edges }: CanvasInput): ResolvedRelation[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const relations = new Map<string, ResolvedRelation>();
  const relate = (relation: Relation, source: string, target: string, edgeId?: string) => {
    const key = `${relation}|${source}|${target}`;
    const r = relations.get(key) ?? { relation, source, target, edgeIds: [], bound: false };
    if (edgeId) r.edgeIds.push(edgeId);
    else r.bound = true;
    relations.set(key, r);
  };

  for (const n of nodes) {
    const target = byId.get(boundToOf(n) ?? '');
    const rel = target && target.id !== n.id ? bindingRelation(n, target) : null;
    if (rel) relate(rel.relation, rel.source, rel.target);
  }
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    const relation = s && t && s.id !== t.id ? edgeRelation(s.type, t.type) : null;
    if (relation) relate(relation, e.source, e.target, e.id);
  }
  return [...relations.values()];
}

/**
 * Pairs of intersecting notes from different binding groups. Aggregates are
 * containers and free-form notes sit outside the grammar, so neither is ever an
 * overlap partner; notes of one group may overlap freely. Tape only overlaps
 * what it could mark (`overlapCounts`).
 */
function findOverlaps(nodes: readonly CanvasNode[], byId: ReadonlyMap<string, CanvasNode>): Overlap[] {
  const notes = nodes.filter((n) => isElementType(n.type) && n.type !== 'aggregate' && !isOutsideGrammar(n.type));
  const rects = new Map(notes.map((n) => [n.id, nodeRect(n)]));
  const roots = new Map(notes.map((n) => [n.id, bindingRoot(n.id, byId)]));
  const out: Overlap[] = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i];
      const b = notes[j];
      if (roots.get(a.id) !== roots.get(b.id) && overlapCounts(a, b) && rectsOverlap(rects.get(a.id)!, rects.get(b.id)!)) {
        out.push({ a, b });
      }
    }
  }
  return out;
}

export function buildContext(input: CanvasInput): CheckContext {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const relations = resolveRelations(input);
  let overlaps: Overlap[] | undefined;
  return {
    nodes: input.nodes,
    edges: input.edges,
    byId,
    relations,
    // O(n²): only computed if a checker asks for it.
    get overlaps() {
      return (overlaps ??= findOverlaps(input.nodes, byId));
    },
    rect: (id) => nodeRect(byId.get(id)!),
    linked: (relation, end, id) =>
      relations
        .filter((r) => r.relation === relation && r[end] === id)
        .map((r) => (end === 'source' ? r.target : r.source)),
  };
}
