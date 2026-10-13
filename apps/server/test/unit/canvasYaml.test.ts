import { canvasToYaml, exampleCanvasSnapshot, toYaml } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';

describe('toYaml', () => {
  it('emits scalars, nested maps, lists of maps and empty collections', () => {
    expect(toYaml({ a: 1, b: true, c: null, d: [], e: {}, f: { g: 'x' }, h: [{ i: 1, j: [2, 'y'] }] })).toBe(
      [
        'a: 1',
        'b: true',
        'c: null',
        'd: []',
        'e: {}',
        'f:',
        '  g: "x"',
        'h:',
        '  - i: 1',
        '    j:',
        '      - 2',
        '      - "y"',
        '',
      ].join('\n'),
    );
  });

  it('quotes every string, so labels never change type or break the document', () => {
    expect(toYaml({ s: ['yes', '1.0', 'a: b', '# no', 'line\nbreak', '订单 "已创建"'] })).toBe(
      ['s:', '  - "yes"', '  - "1.0"', '  - "a: b"', '  - "# no"', '  - "line\\nbreak"', '  - "订单 \\"已创建\\""', ''].join('\n'),
    );
  });

  it('quotes keys that are not plain identifiers and skips undefined values', () => {
    expect(toYaml({ 'odd key': 1, ok: undefined, fine_key: 2 })).toBe('"odd key": 1\nfine_key: 2\n');
  });
});

describe('canvasToYaml', () => {
  it('writes the name, nodes and edges, omitting unset sizes and handles', () => {
    const yaml = canvasToYaml(
      {
        nodes: [{ id: 'e1', type: 'event', position: { x: 10, y: 20 }, data: { label: 'Order Placed', type: 'event' } }],
        edges: [{ id: 'x', source: 'c1', target: 'e1', sourceHandle: null, targetHandle: null }],
      },
      { name: 'Shop' },
    );
    expect(yaml).toBe(
      [
        '# Esbuddy canvas',
        'name: "Shop"',
        'nodes:',
        '  - id: "e1"',
        '    type: "event"',
        '    position:',
        '      x: 10',
        '      y: 20',
        '    data:',
        '      label: "Order Placed"',
        '      type: "event"',
        'edges:',
        '  - id: "x"',
        '    source: "c1"',
        '    target: "e1"',
        '',
      ].join('\n'),
    );
  });

  it('keeps every node and edge of a full board', () => {
    const snap = exampleCanvasSnapshot();
    const yaml = canvasToYaml(snap);
    expect(yaml.match(/^ {2}- id: /gm)).toHaveLength(snap.nodes.length + snap.edges.length);
    expect(yaml).toContain('boundTo: "cmd_place_order"');
    expect(yaml).toContain('aggregateId: "agg_order"');
    // Sizes from legacy `style` survive.
    expect(yaml).toContain('    width: 520\n    height: 260\n');
  });
});
