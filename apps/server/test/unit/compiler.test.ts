import {
  analyzeCanvas,
  bindingTarget,
  nextBinding,
  buildContext,
  CHECKERS,
  type Checker,
  canConnect,
  compileCanvas,
  exampleCanvasSnapshot,
  hasIncomingEdges,
  hasOutgoingEdges,
  type CanvasEdge,
  type CanvasNode,
  type DiagnosticCode,
} from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';

let x = 0;
/** A note placed on its own column so it overlaps nothing unless positioned explicitly. */
const note = (
  id: string,
  type: string,
  extra: Partial<CanvasNode> & { label?: string; aggregateId?: string; boundTo?: string } = {},
): CanvasNode => {
  const { label = id, aggregateId, boundTo, ...rest } = extra;
  x += 1000;
  return {
    id,
    type,
    position: { x, y: 0 },
    width: 100,
    height: 100,
    data: { label, type, ...(aggregateId ? { aggregateId } : {}), ...(boundTo ? { boundTo } : {}) },
    ...rest,
  };
};
const at = (px: number, py: number) => ({ position: { x: px, y: py } });
const edge = (source: string, target: string, id = `e_${source}_${target}`): CanvasEdge => ({ id, source, target });
const codes = (nodes: CanvasNode[], edges: CanvasEdge[] = []) =>
  analyzeCanvas({ nodes, edges }).diagnostics.map((d) => d.code);
const errors = (nodes: CanvasNode[], edges: CanvasEdge[] = []) =>
  analyzeCanvas({ nodes, edges })
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('canvas grammar: edges', () => {
  it.each([
    ['command', 'event'],
    ['event', 'policy'],
    ['policy', 'command'],
    ['actor', 'command'],
    ['event', 'readmodel'],
    ['readmodel', 'command'],
    ['command', 'external'],
    ['external', 'event'],
  ])('allows %s → %s', (s, t) => expect(canConnect(s, t)).toBe(true));

  it.each([
    ['event', 'event'],
    ['actor', 'actor'],
    ['event', 'command'],
    ['policy', 'event'],
    ['event', 'external'],
    ['external', 'command'],
    ['policy', 'external'],
    ['hotspot', 'event'],
    ['event', 'hotspot'],
    ['command', 'aggregate'],
    ['actor', 'event'],
  ])('rejects %s → %s', (s, t) => expect(canConnect(s, t)).toBe(false));

  it('exposes which types can start / end an edge', () => {
    expect(hasOutgoingEdges('actor')).toBe(true);
    expect(hasIncomingEdges('actor')).toBe(false);
    expect(hasOutgoingEdges('hotspot') || hasIncomingEdges('hotspot')).toBe(false);
    expect(hasOutgoingEdges('aggregate') || hasIncomingEdges('aggregate')).toBe(false);
  });

  it('flags illegal, self and dangling edges as errors', () => {
    const nodes = [note('e1', 'event'), note('e2', 'event'), note('c', 'command')];
    // Reported in checker (registry) order.
    expect(errors(nodes, [edge('e1', 'e2'), edge('c', 'c'), edge('c', 'ghost')])).toEqual([
      'dangling-edge',
      'invalid-edge',
      'invalid-edge',
    ]);
  });

  it('warns about duplicate edges', () => {
    const nodes = [note('c', 'command'), note('e', 'event')];
    expect(codes(nodes, [edge('c', 'e', 'a'), edge('c', 'e', 'b')])).toContain('duplicate-edge');
  });
});

describe('canvas grammar: bindings', () => {
  it('reads an actor bound to a command as "issues"', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('a', 'actor', { ...at(80, 80), boundTo: 'c' }), note('e', 'event')];
    const { relations, hasErrors } = analyzeCanvas({ nodes, edges: [edge('c', 'e')] });
    expect(hasErrors).toBe(false);
    expect(relations).toContainEqual(expect.objectContaining({ relation: 'issues', source: 'a', target: 'c', bound: true }));
  });

  it('reads a read model bound to a command as "supports" (read model → command)', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('rm', 'readmodel', { ...at(50, 90), boundTo: 'c' })];
    expect(analyzeCanvas({ nodes, edges: [] }).relations).toContainEqual(
      expect.objectContaining({ relation: 'supports', source: 'rm', target: 'c' }),
    );
  });

  it('only updates a read model through an arrow into it', () => {
    expect(errors([note('e', 'event'), note('rm', 'readmodel', { boundTo: 'e' })])).toEqual(['invalid-binding']);
    expect(analyzeCanvas({ nodes: [note('e', 'event'), note('rm', 'readmodel')], edges: [edge('e', 'rm')] }).relations).toContainEqual(
      expect.objectContaining({ relation: 'updates', source: 'e', target: 'rm' }),
    );
  });

  it('reads the binding, not the geometry', () => {
    const nodes = [note('c', 'command'), note('a', 'actor', { boundTo: 'c' })];
    expect(analyzeCanvas({ nodes, edges: [] }).relations).toContainEqual(
      expect.objectContaining({ relation: 'issues', source: 'a', target: 'c' }),
    );
  });

  it('rejects bindings the grammar does not allow', () => {
    expect(errors([note('e', 'event'), note('a', 'actor', { boundTo: 'e' })])).toEqual(['invalid-binding']);
    expect(errors([note('a', 'actor', { boundTo: 'gone' })])).toEqual(['invalid-binding']);
  });

  it('lets a hot spot be bound to an aggregate', () => {
    const nodes = [
      note('agg', 'aggregate', { ...at(0, 0), width: 600, height: 400 }),
      note('h', 'hotspot', { ...at(400, 250), boundTo: 'agg' }),
    ];
    expect(analyzeCanvas({ nodes, edges: [] }).relations).toContainEqual(
      expect.objectContaining({ relation: 'annotates', source: 'h', target: 'agg' }),
    );
  });

  it('warns when the same relation is both drawn and bound', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('rm', 'readmodel', { ...at(50, 50), boundTo: 'c' })];
    expect(codes(nodes, [edge('rm', 'c')])).toContain('redundant-relation');
  });
});

describe('canvas grammar: overlaps', () => {
  it('treats touching notes as not overlapping', () => {
    expect(errors([note('e1', 'event', at(0, 0)), note('e2', 'event', at(100, 0))])).toEqual([]);
  });

  it('rejects meaningless overlaps (event on event, actor on event)', () => {
    expect(errors([note('e1', 'event', at(0, 0)), note('e2', 'event', at(50, 50))])).toEqual(['invalid-overlap']);
    expect(errors([note('e', 'event', at(0, 0)), note('a', 'actor', at(50, 50))])).toEqual(['invalid-overlap']);
  });

  it('rejects a meaningful overlap that was never bound', () => {
    const d = analyzeCanvas({ nodes: [note('c', 'command', at(0, 0)), note('a', 'actor', at(50, 50))], edges: [] })
      .diagnostics.find((x) => x.code === 'unbound-overlap');
    expect(d?.nodeIds).toEqual(['a', 'c']);
  });

  it('allows notes of one group to overlap each other', () => {
    const nodes = [
      note('c', 'command', at(0, 0)),
      note('a1', 'actor', { ...at(60, 60), boundTo: 'c' }),
      note('a2', 'actor', { ...at(80, 70), boundTo: 'c' }),
      note('h', 'hotspot', { ...at(90, 90), boundTo: 'a1' }),
    ];
    expect(errors(nodes)).toEqual([]);
  });

  it('rejects a bound note that also overlaps a note outside its group', () => {
    const nodes = [
      note('c1', 'command', at(0, 0)),
      note('c2', 'command', at(150, 0)),
      note('a', 'actor', { ...at(80, 20), boundTo: 'c1' }),
    ];
    expect(errors(nodes)).toEqual(['unbound-overlap']);
  });
});

describe('bindingTarget', () => {
  it('binds to the single note the attacher may attach to', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('a', 'actor', at(50, 50))];
    expect(bindingTarget(nodes[1], nodes)).toBe('c');
  });

  it('never guesses between several candidates', () => {
    const nodes = [note('c1', 'command', at(0, 0)), note('c2', 'command', at(150, 0)), note('a', 'actor', at(80, 20))];
    expect(bindingTarget(nodes[2], nodes)).toBeNull();
  });

  it('ignores notes the attacher cannot attach to', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('e', 'event', at(150, 0)), note('a', 'actor', at(80, 20))];
    expect(bindingTarget(nodes[2], nodes)).toBe('c');
  });

  it('binds a hot spot to the aggregate when it is over no note', () => {
    const nodes = [
      note('agg', 'aggregate', { ...at(0, 0), width: 600, height: 400 }),
      note('e', 'event', { ...at(40, 40), aggregateId: 'agg' }),
      note('h', 'hotspot', at(400, 250)),
      note('h2', 'hotspot', at(100, 100)),
    ];
    expect(bindingTarget(nodes[2], nodes)).toBe('agg');
    expect(bindingTarget(nodes[3], nodes)).toBe('e');
  });

  it('never binds into a cycle, and not for non-attachers', () => {
    const nodes = [note('a', 'actor', at(0, 0)), note('h', 'hotspot', { ...at(50, 50), boundTo: 'a' })];
    expect(bindingTarget({ ...nodes[0], type: 'hotspot' }, nodes)).toBeNull();
    expect(bindingTarget(note('e', 'event', at(50, 50)), nodes)).toBeNull();
  });
});

describe('canvas analysis: completeness', () => {
  it.each<[string, CanvasNode[], CanvasEdge[], DiagnosticCode]>([
    ['unnamed note', [note('e', 'event', { label: '  ' })], [], 'empty-label'],
    ['unknown type', [note('n', 'sticky')], [], 'unknown-type'],
    ['policy with no trigger', [note('p', 'policy'), note('c', 'command')], [edge('p', 'c')], 'policy-without-trigger'],
    ['policy with no action', [note('e', 'event'), note('p', 'policy')], [edge('e', 'p')], 'policy-without-action'],
    ['actor inside an aggregate', [note('agg', 'aggregate'), note('a', 'actor', { aggregateId: 'agg' })], [], 'invalid-membership'],
    ['member of a missing aggregate', [note('e', 'event', { aggregateId: 'gone' })], [], 'invalid-membership'],
  ])('errors on %s', (_name, nodes, edges, code) => {
    expect(errors(nodes, edges)).toContain(code);
  });

  it('only warns about loose commands and events', () => {
    const { diagnostics, hasErrors } = analyzeCanvas({ nodes: [note('c', 'command'), note('e', 'event')], edges: [] });
    expect(hasErrors).toBe(false);
    expect(diagnostics.map((d) => d.code).sort()).toEqual([
      'command-without-event',
      'command-without-issuer',
      'event-without-source',
    ]);
  });
});

describe('nextBinding', () => {
  it('keeps the binding while the note still overlaps its target', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('a', 'actor', { ...at(80, 80), boundTo: 'c' })];
    expect(nextBinding(nodes[1], nodes)).toBe('c');
  });

  it('unbinds once dropped off the target', () => {
    const nodes = [note('c', 'command', at(0, 0)), note('a', 'actor', { ...at(500, 500), boundTo: 'c' })];
    expect(nextBinding(nodes[1], nodes)).toBeNull();
  });

  it('rebinds when dropped onto another valid note', () => {
    const nodes = [
      note('c1', 'command', at(0, 0)),
      note('c2', 'command', at(500, 0)),
      note('a', 'actor', { ...at(550, 50), boundTo: 'c1' }),
    ];
    expect(nextBinding(nodes[2], nodes)).toBe('c2');
  });

  it('keeps the current target even if the note also touches another candidate', () => {
    const nodes = [
      note('c1', 'command', at(0, 0)),
      note('c2', 'command', at(150, 0)),
      note('a', 'actor', { ...at(80, 20), boundTo: 'c1' }),
    ];
    expect(nextBinding(nodes[2], nodes)).toBe('c1');
  });
});

describe('free-form notes', () => {
  it('sit outside the grammar: no edges, no bindings', () => {
    expect(canConnect('note', 'event') || canConnect('event', 'note')).toBe(false);
    expect(hasOutgoingEdges('note') || hasIncomingEdges('note')).toBe(false);
    const nodes = [note('c', 'command', at(0, 0)), note('n', 'note', at(50, 50))];
    expect(bindingTarget(note('a', 'actor', at(60, 60)), nodes)).toBe('c');
  });

  it('may overlap anything, may be unnamed, and never reach the compiled text', () => {
    const nodes = [
      note('c', 'command', at(0, 0)),
      note('a', 'actor', { ...at(50, 50), boundTo: 'c' }),
      note('e', 'event'),
      note('n', 'note', { ...at(30, 30), label: '' }),
      note('n2', 'note', { label: 'Ask legal about retention' }),
    ];
    const result = compileCanvas({ nodes, edges: [edge('c', 'e')] });
    expect(result.diagnostics.filter((d) => d.nodeIds.includes('n') || d.nodeIds.includes('n2'))).toEqual([]);
    expect(result.ok && result.text).not.toContain('retention');
  });
});

describe('checkers', () => {
  it('maps every diagnostic code to exactly one checker', () => {
    const codes = CHECKERS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('runs a single checker in isolation over the shared facts', () => {
    const policyWithoutAction = CHECKERS.find((c) => c.code === 'policy-without-action')!;
    const ctx = buildContext({ nodes: [note('e', 'event'), note('p', 'policy')], edges: [edge('e', 'p')] });
    expect([...policyWithoutAction.check(ctx)]).toEqual([{ nodeIds: ['p'] }]);
  });

  it('accepts a custom rule set', () => {
    const noShouting: Checker = {
      code: 'empty-label',
      severity: 'warning',
      *check({ nodes }) {
        for (const n of nodes) if (n.data.label === String(n.data.label).toUpperCase()) yield { nodeIds: [n.id] };
      },
    };
    const { diagnostics, hasErrors } = analyzeCanvas({ nodes: [note('x', 'event', { label: 'LOUD' })], edges: [] }, [noShouting]);
    expect(hasErrors).toBe(false);
    expect(diagnostics).toEqual([{ code: 'empty-label', severity: 'warning', nodeIds: ['x'], edgeIds: [] }]);
  });

  it('only resolves relations from legal edges and bindings', () => {
    const ctx = buildContext({ nodes: [note('e1', 'event'), note('e2', 'event'), note('c', 'command')], edges: [edge('e1', 'e2'), edge('c', 'e1')] });
    expect(ctx.relations.map((r) => r.relation)).toEqual(['produces']);
  });
});

describe('compileCanvas', () => {
  it('refuses to compile while errors remain', () => {
    const result = compileCanvas({ nodes: [note('e1', 'event'), note('e2', 'event')], edges: [edge('e1', 'e2')] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('invalid-edge');
  });

  it('compiles the example board cleanly into English', () => {
    const snap = exampleCanvasSnapshot();
    const result = compileCanvas(snap, { title: 'Order Fulfillment' });
    expect(result.diagnostics).toEqual([]);
    if (!result.ok) throw new Error('expected the example to compile');
    expect(result.text).toMatch(/^# Order Fulfillment\n/);
    for (const line of [
      '- The aggregate "Order" records "Order Placed" and "Order Confirmed".',
      '- "Customer" issues "Place Order" based on the read model "Cart", which produces "Order Placed".',
      '- "Request Payment" produces "Payment Requested" and invokes the external system "Payment Gateway".',
      '- Whenever "Order Placed" occurs, the policy "Collect Payment" issues "Request Payment".',
      '- The external system "Payment Gateway" emits "Payment Confirmed".',
      '- The read model "Picking List" is updated by "Shipment Prepared".',
      '- On "Payment Requested": Payment failure? — Timeouts, declines, partial captures?',
    ]) {
      expect(result.text).toContain(line);
    }
  });

  it('states edge and binding spellings of a relation identically', () => {
    const stuck = [note('c', 'command', at(0, 0)), note('a', 'actor', { ...at(80, 80), label: 'Clerk', boundTo: 'c' }), note('e', 'event')];
    const drawn = [note('c', 'command'), note('a', 'actor', { label: 'Clerk' }), note('e', 'event')];
    const a = compileCanvas({ nodes: stuck, edges: [edge('c', 'e')] });
    const b = compileCanvas({ nodes: drawn, edges: [edge('c', 'e'), edge('a', 'c')] });
    expect(a.ok && a.text).toContain('- "Clerk" issues "c", which produces "e".');
    expect(b.ok && b.text).toContain('- "Clerk" issues "c", which produces "e".');
  });

  it('lists notes that take part in no relation in the glossary', () => {
    const result = compileCanvas({ nodes: [note('x', 'external', { label: 'CRM' })], edges: [] });
    expect(result.ok && result.text).toBe('## Glossary\n\n- "CRM" (external system)\n');
  });
});
