import { bindingRelation, boundToOf, overlapRelation } from '../../grammar.js';
import type { Checker } from '../types.js';

/** A note bound to something it may not attach to, or to a note that's gone. */
export const invalidBinding: Checker = {
  code: 'invalid-binding',
  severity: 'error',
  *check({ nodes, byId }) {
    for (const n of nodes) {
      const id = boundToOf(n);
      if (!id) continue;
      const target = byId.get(id);
      if (!target) yield { nodeIds: [n.id] };
      else if (target.id === n.id || !bindingRelation(n, target)) yield { nodeIds: [n.id, target.id] };
    }
  },
};

/** Two notes overlap, but no relation can be read from that pair. */
export const invalidOverlap: Checker = {
  code: 'invalid-overlap',
  severity: 'error',
  *check({ overlaps }) {
    for (const { a, b } of overlaps) if (!overlapRelation(a, b)) yield { nodeIds: [a.id, b.id] };
  },
};

/** Two notes overlap meaningfully, but were never bound — the compiler won't guess. */
export const unboundOverlap: Checker = {
  code: 'unbound-overlap',
  severity: 'error',
  *check({ overlaps }) {
    for (const { a, b } of overlaps) {
      const rel = overlapRelation(a, b);
      if (rel) yield { nodeIds: rel.attacher === a.id ? [a.id, b.id] : [b.id, a.id] };
    }
  },
};

/** A relation both bound and drawn; one spelling is enough. */
export const redundantRelation: Checker = {
  code: 'redundant-relation',
  severity: 'warning',
  *check({ relations }) {
    for (const r of relations) if (r.bound && r.edgeIds.length > 0) yield { nodeIds: [r.source, r.target], edgeIds: r.edgeIds };
  },
};
