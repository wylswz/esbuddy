import type { Relation } from '../../grammar.js';
import type { Checker, DiagnosticCode, Severity } from '../types.js';

/**
 * Every note of `type` must take part in at least one of `relations`, at the
 * given end. E.g. a policy must be the *target* of a `triggers` relation.
 */
function requires(
  code: DiagnosticCode,
  severity: Severity,
  type: string,
  relations: Relation[],
  end: 'source' | 'target',
): Checker {
  return {
    code,
    severity,
    *check({ nodes, linked }) {
      for (const n of nodes) {
        if (n.type === type && relations.every((r) => linked(r, end, n.id).length === 0)) yield { nodeIds: [n.id] };
      }
    },
  };
}

/** "Whenever E …" — a policy needs a triggering event. */
export const policyWithoutTrigger = requires('policy-without-trigger', 'error', 'policy', ['triggers'], 'target');

/** "… then C" — a policy needs a command to issue. */
export const policyWithoutAction = requires('policy-without-action', 'error', 'policy', ['issues'], 'source');

export const commandWithoutEvent = requires('command-without-event', 'warning', 'command', ['produces'], 'source');

export const commandWithoutIssuer = requires('command-without-issuer', 'warning', 'command', ['issues'], 'target');

export const eventWithoutSource = requires('event-without-source', 'warning', 'event', ['produces', 'emits'], 'target');
