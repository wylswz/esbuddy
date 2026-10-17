import { isOutsideGrammar, nodeRect, type Relation } from './grammar.js';
import { analyzeCanvas, type CanvasInput, type Diagnostic } from './analysis/index.js';
import { aggregateIdOf, labelOf as label } from './analysis/context.js';

/*
 * Canvas → natural-language compiler.
 *
 * Analysis (`analysis/`) runs every checker first; while any error remains the
 * compiler refuses to compile. Otherwise it renders the resolved relations as
 * plain English, each relation stated once. Warnings never block compiling.
 */

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
  pivotal: 'pivotal tape',
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

  // Pivotal events split the timeline into phases, so they come first. Several
  // strips of tape on one event say it once; their labels (optional) are kept.
  sections.push([
    'Pivotal events',
    ofType('event').flatMap((id) => {
      const tapes = linked('marks', 'target', id);
      if (tapes.length === 0) return [];
      const notes = [...new Set(tapes.sort(timeline).map((t) => label(byId.get(t)!)).filter(Boolean))];
      return [`${q(id)} is a pivotal event${notes.length ? `: ${notes.join('; ')}` : ''}.`];
    }),
  ]);

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
      .filter(
        (n) =>
          n.type !== 'hotspot' &&
          n.type !== 'pivotal' &&
          !isOutsideGrammar(n.type) &&
          (describe(n.id) || !mentioned.has(n.id)),
      )
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
