import { laneGap, moveLane, placeLane, resizeLane, type CanvasLane } from '@esbuddy/sdk';
import { describe, expect, it } from 'vitest';

const lane = (id: string, y: number, height: number): CanvasLane => ({ id, label: id, y, height });
// a: 0–100, gap 100–300, b: 300–400
const lanes = [lane('a', 0, 100), lane('b', 300, 100)];

describe('swimlanes never overlap', () => {
  it('finds the free gap around a point', () => {
    expect(laneGap(lanes, 150)).toEqual({ top: 100, bottom: 300 });
    expect(laneGap(lanes, -50)).toEqual({ top: -Infinity, bottom: 0 });
    expect(laneGap(lanes, 500)).toEqual({ top: 400, bottom: Infinity });
    expect(laneGap(lanes, 50)).toBeNull();
    expect(laneGap(lanes, 50, 'a')).toEqual({ top: -Infinity, bottom: 300 });
  });

  it('places a new lane inside its gap: shortened, or nudged up', () => {
    expect(placeLane(lanes, 120, 240, 60)).toEqual({ y: 120, height: 180 });
    expect(placeLane(lanes, 280, 240, 60)).toEqual({ y: 240, height: 60 });
    expect(placeLane(lanes, 500, 240, 60)).toEqual({ y: 500, height: 240 });
    expect(placeLane(lanes, 50, 240, 60)).toBeNull();
    expect(placeLane([lane('a', 0, 100), lane('b', 140, 100)], 110, 240, 60)).toBeNull();
  });

  it('stops a moved lane at its neighbours', () => {
    expect(moveLane(lanes, 'a', 250)).toBe(200);
    expect(moveLane(lanes, 'b', 50)).toBe(100);
    expect(moveLane(lanes, 'b', 1000)).toBe(1000);
  });

  it('stops a resized edge at the neighbour and keeps a minimum height', () => {
    expect(resizeLane(lanes, 'a', 'bottom', 350, 60)).toEqual({ y: 0, height: 300 });
    expect(resizeLane(lanes, 'a', 'bottom', 10, 60)).toEqual({ y: 0, height: 60 });
    expect(resizeLane(lanes, 'b', 'top', 50, 60)).toEqual({ y: 100, height: 300 });
    expect(resizeLane(lanes, 'b', 'top', 390, 60)).toEqual({ y: 340, height: 60 });
  });
});
