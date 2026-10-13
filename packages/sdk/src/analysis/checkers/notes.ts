import { isElementType } from '../../grammar.js';
import { aggregateIdOf, labelOf } from '../context.js';
import type { Checker } from '../types.js';

const MEMBER_TYPES = new Set(['event', 'command']);

/** Every note must be one of the Event Storming element types. */
export const unknownType: Checker = {
  code: 'unknown-type',
  severity: 'error',
  *check({ nodes }) {
    for (const n of nodes) if (!isElementType(n.type)) yield { nodeIds: [n.id] };
  },
};

/** A note the compiler can't name can't be put into a sentence. */
export const emptyLabel: Checker = {
  code: 'empty-label',
  severity: 'error',
  *check({ nodes }) {
    for (const n of nodes) if (isElementType(n.type) && !labelOf(n)) yield { nodeIds: [n.id] };
  },
};

/** Only events and commands belong to an aggregate, and only to one that exists. */
export const invalidMembership: Checker = {
  code: 'invalid-membership',
  severity: 'error',
  *check({ nodes, byId }) {
    for (const n of nodes) {
      const agg = aggregateIdOf(n);
      if (agg && (!MEMBER_TYPES.has(n.type) || byId.get(agg)?.type !== 'aggregate')) yield { nodeIds: [n.id] };
    }
  },
};
