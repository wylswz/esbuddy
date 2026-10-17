import { analyzeCanvas, compileCanvas, guideBoards, type GuideLabel } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';

const label = (key: GuideLabel) => key;

describe('guide example boards', () => {
  const boards = guideBoards(label);

  it('the full story compiles with zero diagnostics', () => {
    const result = compileCanvas(boards.compile);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok && result.text).toContain('"paymentReceived" is a pivotal event.');
    expect(result.ok && result.text).toContain('"customer" issues "placeOrder" based on the read model "cart", which produces "orderPlaced".');
  });

  it('the process and design steps carry no errors', () => {
    for (const id of ['process', 'aggregates', 'hotspots', 'structure', 'vote'] as const) {
      expect(analyzeCanvas(boards[id]).diagnostics.filter((d) => d.severity === 'error'), id).toEqual([]);
    }
  });

  it('the structure step shows swimlanes and temporal milestones', () => {
    expect(boards.structure.structure?.lanes).toHaveLength(2);
    expect(boards.structure.structure?.milestones).toHaveLength(2);
  });

  it('the vote step only votes on hot spots on the board', () => {
    const hotspots = new Set(boards.vote.nodes.filter((n) => n.type === 'hotspot').map((n) => n.id));
    expect(boards.vote.votes?.length).toBeGreaterThan(0);
    for (const v of boards.vote.votes ?? []) expect(hotspots.has(v.nodeId), v.nodeId).toBe(true);
  });
});
