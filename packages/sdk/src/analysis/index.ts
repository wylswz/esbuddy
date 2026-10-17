import { buildContext } from './context.js';
import { invalidBinding, invalidOverlap, redundantRelation, unboundOverlap } from './checkers/bindings.js';
import {
  commandWithoutEvent,
  commandWithoutIssuer,
  eventWithoutSource,
  pivotalWithoutEvent,
  policyWithoutAction,
  policyWithoutTrigger,
} from './checkers/completeness.js';
import { danglingEdge, duplicateEdge, invalidEdge } from './checkers/edges.js';
import { emptyLabel, invalidMembership, unknownType } from './checkers/notes.js';
import type { CanvasAnalysis, CanvasInput, Checker, Diagnostic } from './types.js';

export * from './types.js';
export { buildContext, resolveRelations } from './context.js';

/*
 * Canvas analysis = facts + rules.
 *
 *   buildContext  turns a canvas into facts (relations from legal edges and
 *                 bindings, overlaps across groups) without judging anything.
 *   Checker       one rule, one diagnostic code; reads the facts, yields findings.
 *   CHECKERS      the rule set, in reporting order. Add a rule by writing a
 *                 checker and listing it here (plus its translation in the UI).
 */
export const CHECKERS: readonly Checker[] = [
  unknownType,
  emptyLabel,
  invalidMembership,
  danglingEdge,
  invalidEdge,
  invalidBinding,
  invalidOverlap,
  unboundOverlap,
  policyWithoutTrigger,
  policyWithoutAction,
  pivotalWithoutEvent,
  duplicateEdge,
  redundantRelation,
  commandWithoutEvent,
  commandWithoutIssuer,
  eventWithoutSource,
];

/** Run every checker over the canvas. Errors are listed before warnings. */
export function analyzeCanvas(input: CanvasInput, checkers: readonly Checker[] = CHECKERS): CanvasAnalysis {
  const ctx = buildContext(input);
  const diagnostics: Diagnostic[] = checkers.flatMap(({ code, severity, check }) =>
    [...check(ctx)].map((f) => ({ code, severity, nodeIds: f.nodeIds, edgeIds: f.edgeIds ?? [] })),
  );
  diagnostics.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return { diagnostics, relations: [...ctx.relations], hasErrors: diagnostics.some((d) => d.severity === 'error') };
}
