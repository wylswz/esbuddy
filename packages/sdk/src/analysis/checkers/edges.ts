import { edgeRelation } from '../../grammar.js';
import type { Checker } from '../types.js';

/** An edge whose source or target note no longer exists. */
export const danglingEdge: Checker = {
  code: 'dangling-edge',
  severity: 'error',
  *check({ edges, byId }) {
    for (const e of edges) {
      if (byId.has(e.source) && byId.has(e.target)) continue;
      yield { nodeIds: [e.source, e.target].filter((id) => byId.has(id)), edgeIds: [e.id] };
    }
  },
};

/** An edge the grammar gives no meaning to (including a note pointing at itself). */
export const invalidEdge: Checker = {
  code: 'invalid-edge',
  severity: 'error',
  *check({ edges, byId }) {
    for (const e of edges) {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (s && t && (s.id === t.id || !edgeRelation(s.type, t.type))) yield { nodeIds: [s.id, t.id], edgeIds: [e.id] };
    }
  },
};

/** The same relation drawn more than once. */
export const duplicateEdge: Checker = {
  code: 'duplicate-edge',
  severity: 'warning',
  *check({ relations }) {
    for (const r of relations) if (r.edgeIds.length > 1) yield { nodeIds: [r.source, r.target], edgeIds: r.edgeIds };
  },
};
