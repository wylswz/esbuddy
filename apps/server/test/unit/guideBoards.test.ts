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
    for (const id of ['process', 'aggregates', 'hotspots', 'structure'] as const) {
      expect(analyzeCanvas(boards[id]).diagnostics.filter((d) => d.severity === 'error'), id).toEqual([]);
    }
  });

  it('the structure step shows swimlanes and temporal milestones', () => {
    expect(boards.structure.structure?.lanes).toHaveLength(2);
    expect(boards.structure.structure?.milestones).toHaveLength(2);
  });
});
