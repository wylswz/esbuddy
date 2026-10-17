import type { CanvasEdge, CanvasNode } from '../domain.js';
import type { Rect, Relation } from '../grammar.js';

export type Severity = 'error' | 'warning';

/** One code per checker. Kept as a closed union so UI translations are type-checked. */
export type DiagnosticCode =
  // errors
  | 'unknown-type'
  | 'empty-label'
  | 'dangling-edge'
  | 'invalid-edge'
  | 'invalid-overlap'
  | 'unbound-overlap'
  | 'invalid-binding'
  | 'invalid-membership'
  | 'policy-without-trigger'
  | 'policy-without-action'
  | 'pivotal-without-event'
  // warnings
  | 'duplicate-edge'
  | 'redundant-relation'
  | 'command-without-event'
  | 'command-without-issuer'
  | 'event-without-source';

/** What a checker found: the notes (and edges) at fault. */
export interface Finding {
  /**
   * Notes involved. Order is meaningful per code: the edge's source/target,
   * the overlapping pair (attacher first when there is one), or the bound note
   * followed by what it is bound to.
   */
  nodeIds: string[];
  edgeIds?: string[];
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  nodeIds: string[];
  edgeIds: string[];
}

export interface ResolvedRelation {
  relation: Relation;
  source: string;
  target: string;
  /** Edges spelling this relation (several ⇒ duplicate). */
  edgeIds: string[];
  /** Also (or only) spelled by a binding. */
  bound: boolean;
}

export interface CanvasInput {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Two notes from different groups whose rectangles intersect. */
export interface Overlap {
  a: CanvasNode;
  b: CanvasNode;
}

/**
 * Facts about a canvas, computed once and shared by every checker. Carries no
 * judgement: relations come only from legal edges and bindings; whatever is
 * illegal is for a checker to notice.
 */
export interface CheckContext {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
  readonly byId: ReadonlyMap<string, CanvasNode>;
  readonly relations: readonly ResolvedRelation[];
  /** Overlapping notes that don't belong to the same binding group. */
  readonly overlaps: readonly Overlap[];
  rect(id: string): Rect;
  /** Ids related to `id` through `relation`, from the given end of the relation. */
  linked(relation: Relation, end: 'source' | 'target', id: string): string[];
}

/** A single rule: one checker reports exactly one diagnostic code. */
export interface Checker {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  check(ctx: CheckContext): Iterable<Finding>;
}

export interface CanvasAnalysis {
  diagnostics: Diagnostic[];
  relations: ResolvedRelation[];
  hasErrors: boolean;
}
