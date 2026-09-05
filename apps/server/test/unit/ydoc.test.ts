import * as Y from 'yjs';
import {
  docFromSnapshot,
  docToSnapshot,
  exampleCanvasSnapshot,
  getNodesMap,
  isDocEmpty,
  orderedNodeIds,
  readNode,
  snapshotToDoc,
  type CanvasSnapshot,
} from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';

const snap = (nodes: CanvasSnapshot['nodes'], edges: CanvasSnapshot['edges'] = []): CanvasSnapshot => ({
  nodes,
  edges,
  viewport: null,
});

describe('canvas Y.Doc schema', () => {
  it('round-trips the example board (nodes, edges, sizes, order)', () => {
    const input = exampleCanvasSnapshot();
    const out = docToSnapshot(docFromSnapshot(input));

    expect(out.nodes.map((n) => n.id)).toEqual(input.nodes.map((n) => n.id));
    expect(out.edges.map((e) => e.id).sort()).toEqual(input.edges.map((e) => e.id).sort());
    // Example nodes carry React Flow `style` sizes; they must survive as width/height.
    const first = input.nodes[0] as unknown as { style: { width: number; height: number } };
    expect(out.nodes[0]).toMatchObject({ width: first.style.width, height: first.style.height });
    expect(out.nodes.find((n) => n.id === 'ev_order_placed')?.data).toMatchObject({
      label: 'Order Placed',
      aggregateId: 'agg_order',
    });
    expect(out.viewport).toBeNull();
  });

  it('keeps aggregates behind notes regardless of z', () => {
    const doc = docFromSnapshot(
      snap([
        { id: 'n1', type: 'event', position: { x: 0, y: 0 }, data: {} },
        { id: 'agg', type: 'aggregate', position: { x: 0, y: 0 }, data: {} },
        { id: 'n2', type: 'command', position: { x: 0, y: 0 }, data: {} },
      ]),
    );
    expect(orderedNodeIds(getNodesMap(doc))).toEqual(['agg', 'n1', 'n2']);
  });

  it('merges concurrent edits to different fields of the same node', () => {
    const a = docFromSnapshot(snap([{ id: 'n', type: 'event', position: { x: 0, y: 0 }, data: { label: 'old' } }]));
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    getNodesMap(a).get('n')!.set('x', 100); // A moves it
    (getNodesMap(b).get('n')!.get('data') as Y.Map<unknown>).set('label', 'new'); // B renames it

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    for (const doc of [a, b]) {
      const n = readNode('n', getNodesMap(doc).get('n')!);
      expect(n.position.x).toBe(100);
      expect(n.data.label).toBe('new');
    }
  });

  it('snapshotToDoc replaces existing content', () => {
    const doc = docFromSnapshot(exampleCanvasSnapshot());
    expect(isDocEmpty(doc)).toBe(false);
    snapshotToDoc(snap([]), doc);
    expect(isDocEmpty(doc)).toBe(true);
  });
});
