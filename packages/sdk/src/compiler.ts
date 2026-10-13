import type { CanvasEdge, CanvasNode } from './domain.js';
import {
  bindingRelation,
  bindingRoot,
  boundToOf,
  edgeRelation,
  isElementType,
  nodeRect,
  overlapRelation,
  rectsOverlap,
  type Relation,
} from './grammar.js';

/*
 * Canvas → natural-language compiler.
 *
 *   analyzeCanvas  resolves every edge and binding (`data.boundTo`) against
 *                  the grammar (`grammar.ts`) into relations, checks that no
 *                  note overlaps another outside its group, and reports
 *                  diagnostics.
 *   compileCanvas  refuses to compile while any error remains; otherwise
 *                  renders the relations as plain English, each stated once.
 *
 * Errors are things the compiler cannot read without guessing (illegal or
 * ambiguous relations, unnamed notes, half-written policies). Warnings are
 * legal but likely incomplete models; they never block compiling.
 */

export type Severity = 'error' | 'warning';

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
  // warnings
  | 'duplicate-edge'
  | 'redundant-relation'
  | 'command-without-event'
  | 'command-without-issuer'
  | 'event-without-source';

export const DIAGNOSTIC_SEVERITY: Readonly<Record<DiagnosticCode, Severity>> = {
  'unknown-type': 'error',
  'empty-label': 'error',
  'dangling-edge': 'error',
  'invalid-edge': 'error',
  'invalid-overlap': 'error',
  'unbound-overlap': 'error',
  'invalid-binding': 'error',
  'invalid-membership': 'error',
  'policy-without-trigger': 'error',
  'policy-without-action': 'error',
  'duplicate-edge': 'warning',
  'redundant-relation': 'warning',
  'command-without-event': 'warning',
  'command-without-issuer': 'warning',
  'event-without-source': 'warning',
};

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  /**
   * Notes involved. Order is meaningful per code: the edge's source/target,
   * the overlapping pair (attacher first when there is one), or the bound note
   * followed by what it is bound to.
   */
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

export interface CanvasAnalysis {
  diagnostics: Diagnostic[];
  relations: ResolvedRelation[];
  hasErrors: boolean;
}

export interface CanvasInput {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const MEMBER_TYPES = new Set(['event', 'command']);

function label(n: CanvasNode): string {
  const l = n.data?.label;
  return typeof l === 'string' ? l.replace(/\s+/g, ' ').trim() : '';
}

function aggregateIdOf(n: CanvasNode): string | null {
  const a = n.data?.aggregateId;
  return typeof a === 'string' && a ? a : null;
}

export function analyzeCanvas({ nodes, edges }: CanvasInput): CanvasAnalysis {
  const diagnostics: Diagnostic[] = [];
  const report = (code: DiagnosticCode, nodeIds: string[], edgeIds: string[] = []) =>
    diagnostics.push({ code, severity: DIAGNOSTIC_SEVERITY[code], nodeIds, edgeIds });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const relations = new Map<string, ResolvedRelation>();
  const relate = (relation: Relation, source: string, target: string, via: { edgeId?: string }) => {
    const key = `${relation}|${source}|${target}`;
    const r = relations.get(key) ?? { relation, source, target, edgeIds: [], bound: false };
    if (via.edgeId) r.edgeIds.push(via.edgeId);
    else r.bound = true;
    relations.set(key, r);
  };

  // Notes.
  for (const n of nodes) {
    if (!isElementType(n.type)) {
      report('unknown-type', [n.id]);
      continue;
    }
    if (!label(n)) report('empty-label', [n.id]);
    const aggId = aggregateIdOf(n);
    if (aggId && (!MEMBER_TYPES.has(n.type) || byId.get(aggId)?.type !== 'aggregate')) {
      report('invalid-membership', [n.id]);
    }
    const boundTo = boundToOf(n);
    if (boundTo) {
      const target = byId.get(boundTo);
      const rel = target && target.id !== n.id ? bindingRelation(n, target) : null;
      if (!rel) report('invalid-binding', target ? [n.id, target.id] : [n.id]);
      else relate(rel.relation, rel.source, rel.target, {});
    }
  }

  // Edges.
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      report('dangling-edge', [s?.id, t?.id].filter((id): id is string => !!id), [e.id]);
      continue;
    }
    const relation = s.id === t.id ? null : edgeRelation(s.type, t.type);
    if (!relation) report('invalid-edge', [s.id, t.id], [e.id]);
    else relate(relation, s.id, t.id, { edgeId: e.id });
  }

  // Overlaps between notes (aggregates are containers, never overlap partners).
  // Notes of one group (bound together, directly or via a shared note) may
  // overlap; any other overlap is either meaningless or a binding not made.
  const notes = nodes.filter((n) => isElementType(n.type) && n.type !== 'aggregate');
  const rects = new Map(nodes.map((n) => [n.id, nodeRect(n)]));
  const roots = new Map(notes.map((n) => [n.id, bindingRoot(n.id, byId)]));
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i];
      const b = notes[j];
      if (roots.get(a.id) === roots.get(b.id)) continue;
      if (!rectsOverlap(rects.get(a.id)!, rects.get(b.id)!)) continue;
      const rel = overlapRelation(a, b);
      if (!rel) report('invalid-overlap', [a.id, b.id]);
      else report('unbound-overlap', [rel.attacher, rel.attacher === a.id ? b.id : a.id]);
    }
  }

  const resolved = [...relations.values()];
  for (const r of resolved) {
    if (r.edgeIds.length > 1) report('duplicate-edge', [r.source, r.target], r.edgeIds);
    if (r.bound && r.edgeIds.length > 0) report('redundant-relation', [r.source, r.target], r.edgeIds);
  }

  // Completeness of the notes that carry grammar of their own.
  const count = (relation: Relation, end: 'source' | 'target', id: string) =>
    resolved.filter((r) => r.relation === relation && r[end] === id).length;
  for (const n of nodes) {
    if (n.type === 'policy') {
      if (count('triggers', 'target', n.id) === 0) report('policy-without-trigger', [n.id]);
      if (count('issues', 'source', n.id) === 0) report('policy-without-action', [n.id]);
    } else if (n.type === 'command') {
      if (count('produces', 'source', n.id) === 0) report('command-without-event', [n.id]);
      if (count('issues', 'target', n.id) === 0) report('command-without-issuer', [n.id]);
    } else if (n.type === 'event') {
      if (count('produces', 'target', n.id) + count('emits', 'target', n.id) === 0) {
        report('event-without-source', [n.id]);
      }
    }
  }

  diagnostics.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return { diagnostics, relations: resolved, hasErrors: diagnostics.some((d) => d.severity === 'error') };
}

// ---------- English rendering ----------

export type CompileResult =
  | { ok: true; text: string; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export interface CompileOptions {
  /** Rendered as the top-level heading when given. */
  title?: string;
}

const TYPE_NOUN: Record<string, string> = {
  event: 'event',
  command: 'command',
  aggregate: 'aggregate',
  actor: 'actor',
  policy: 'policy',
  external: 'external system',
  hotspot: 'hot spot',
  readmodel: 'read model',
};

function list(items: string[], conj: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conj} ${items[items.length - 1]}`;
}

function plural(noun: string, n: number): string {
  if (n === 1) return noun;
  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}

export function compileCanvas(input: CanvasInput, options: CompileOptions = {}): CompileResult {
  const { diagnostics, relations, hasErrors } = analyzeCanvas(input);
  if (hasErrors) return { ok: false, diagnostics };

  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const rects = new Map(input.nodes.map((n) => [n.id, nodeRect(n)]));
  // Event Storming reads left to right along the timeline, then top to bottom.
  const timeline = (a: string, b: string) => {
    const ra = rects.get(a)!;
    const rb = rects.get(b)!;
    return ra.x - rb.x || ra.y - rb.y || (a < b ? -1 : a > b ? 1 : 0);
  };
  const ofType = (type: string) =>
    input.nodes
      .filter((n) => n.type === type)
      .map((n) => n.id)
      .sort(timeline);
  const q = (id: string) => `"${label(byId.get(id)!)}"`;
  const qs = (ids: string[], conj: 'and' | 'or' = 'and') => list([...ids].sort(timeline).map(q), conj);
  const typed = (type: string, ids: string[]) => `the ${plural(TYPE_NOUN[type], ids.length)} ${qs(ids)}`;
  const linked = (relation: Relation, end: 'source' | 'target', id: string, type?: string) =>
    relations
      .filter((r) => r.relation === relation && r[end] === id)
      .map((r) => (end === 'source' ? r.target : r.source))
      .filter((other) => !type || byId.get(other)?.type === type);
  const membersOf = (aggId: string, type: string) =>
    input.nodes.filter((n) => n.type === type && aggregateIdOf(n) === aggId).map((n) => n.id);
  const describe = (id: string) => {
    const d = byId.get(id)?.data?.description;
    return typeof d === 'string' ? d.replace(/\s+/g, ' ').trim() : '';
  };

  const sections: [string, string[]][] = [];

  sections.push([
    'Aggregates',
    ofType('aggregate').flatMap((id) => {
      const parts = [];
      const cmds = membersOf(id, 'command');
      const evts = membersOf(id, 'event');
      if (cmds.length) parts.push(`handles ${qs(cmds)}`);
      if (evts.length) parts.push(`records ${qs(evts)}`);
      return parts.length ? [`The aggregate ${q(id)} ${list(parts)}.`] : [];
    }),
  ]);

  sections.push([
    'Commands',
    ofType('command').flatMap((id) => {
      const actors = linked('issues', 'target', id, 'actor');
      const basis = linked('supports', 'target', id);
      const preds = [];
      const produced = linked('produces', 'source', id);
      const invoked = linked('invokes', 'source', id);
      if (produced.length) preds.push(`produces ${qs(produced)}`);
      if (invoked.length) preds.push(`invokes ${typed('external', invoked)}`);
      if (actors.length) {
        const head = `${qs(actors)} ${actors.length > 1 ? 'issue' : 'issues'} ${q(id)}`;
        const based = basis.length ? ` based on ${typed('readmodel', basis)}` : '';
        return [`${head}${based}${preds.length ? `, which ${list(preds)}` : ''}.`];
      }
      if (basis.length) preds.unshift(`is decided based on ${typed('readmodel', basis)}`);
      return preds.length ? [`${q(id)} ${list(preds)}.`] : [];
    }),
  ]);

  sections.push([
    'Policies',
    ofType('policy').map(
      (id) =>
        `Whenever ${qs(linked('triggers', 'target', id), 'or')} occurs, the policy ${q(id)} issues ${qs(linked('issues', 'source', id))}.`,
    ),
  ]);

  sections.push([
    'External systems',
    ofType('external').flatMap((id) => {
      const emitted = linked('emits', 'source', id);
      return emitted.length ? [`The external system ${q(id)} emits ${qs(emitted)}.`] : [];
    }),
  ]);

  sections.push([
    'Read models',
    ofType('readmodel').flatMap((id) => {
      const from = linked('updates', 'target', id);
      return from.length ? [`The read model ${q(id)} is updated by ${qs(from)}.`] : [];
    }),
  ]);

  sections.push([
    'Hot spots',
    ofType('hotspot').map((id) => {
      const [target] = linked('annotates', 'source', id);
      const where = target
        ? `On ${byId.get(target)!.type === 'aggregate' ? `the aggregate ${q(target)}` : q(target)}: `
        : '';
      const d = describe(id);
      return `${where}${label(byId.get(id)!)}${d ? ` — ${d}` : ''}`;
    }),
  ]);

  // Every note appears somewhere: those described, or not mentioned above.
  const mentioned = new Set<string>();
  for (const r of relations) mentioned.add(r.source).add(r.target);
  for (const n of input.nodes) {
    const agg = aggregateIdOf(n);
    if (agg) mentioned.add(n.id).add(agg);
  }
  sections.push([
    'Glossary',
    input.nodes
      .filter((n) => n.type !== 'hotspot' && (describe(n.id) || !mentioned.has(n.id)))
      .map((n) => n.id)
      .sort(timeline)
      .map((id) => {
        const d = describe(id);
        return `${q(id)} (${TYPE_NOUN[byId.get(id)!.type]})${d ? `: ${d}` : ''}`;
      }),
  ]);

  const out: string[] = [];
  if (options.title?.trim()) out.push(`# ${options.title.trim()}`, '');
  for (const [heading, lines] of sections) {
    if (lines.length === 0) continue;
    out.push(`## ${heading}`, '', ...lines.map((l) => `- ${l}`), '');
  }
  return { ok: true, text: out.join('\n').trimEnd() + '\n', diagnostics };
}
