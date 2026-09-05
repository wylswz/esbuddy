import { docToSnapshot, snapshotToDoc, type CanvasOwner, type CanvasSnapshot } from '@esbuddy/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import * as canvas from '../../src/modules/canvas/service.js';
import type { Db } from '../../src/db/types.js';
import { createTestDb } from '../helpers/db.js';

const owner: CanvasOwner = { type: 'user', userId: 'u1' };

function snapshot(nodeIds: string[]): CanvasSnapshot {
  return {
    nodes: nodeIds.map((id) => ({ id, type: 'event', position: { x: 0, y: 0 }, data: {} })),
    edges: [],
    viewport: null,
  };
}

describe('canvas service', () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it('creates an empty canvas', async () => {
    const meta = await canvas.createCanvas(db, 'My Canvas', owner, 'u1');
    expect(meta.name).toBe('My Canvas');
    expect(meta.version).toBe(0);
    const rec = await canvas.getCanvas(db, meta.id);
    expect(rec?.snapshot).toEqual({ nodes: [], edges: [], viewport: null });
  });

  it('flushing a room doc bumps the version and materialises the snapshot', async () => {
    const meta = await canvas.createCanvas(db, 'C', owner, 'u1');
    const doc = (await canvas.loadCanvasDoc(db, meta.id))!;
    snapshotToDoc(snapshot(['n1']), doc);
    expect(await canvas.saveCanvasDoc(db, meta.id, doc)).toBe(true);

    const rec = await canvas.getCanvas(db, meta.id);
    expect(rec?.version).toBe(1);
    expect(rec?.snapshot.nodes.map((n) => n.id)).toEqual(['n1']);

    // Reloading prefers the stored CRDT state over the snapshot.
    const again = (await canvas.loadCanvasDoc(db, meta.id))!;
    expect(docToSnapshot(again).nodes.map((n) => n.id)).toEqual(['n1']);
  });

  it('loadCanvasDoc converts a snapshot-only (legacy/seeded) canvas and returns null when missing', async () => {
    const meta = await canvas.seedExampleCanvas(db, 'w1', 'u1');
    const doc = (await canvas.loadCanvasDoc(db, meta.id))!;
    expect(docToSnapshot(doc).nodes.length).toBeGreaterThan(0);
    expect(await canvas.loadCanvasDoc(db, 'does-not-exist')).toBeNull();
    expect(await canvas.saveCanvasDoc(db, 'does-not-exist', doc)).toBe(false);
  });

  it('renames without bumping the version', async () => {
    const meta = await canvas.createCanvas(db, 'Old', owner, 'u1');
    const renamed = await canvas.renameCanvas(db, meta.id, 'New');
    expect(renamed?.name).toBe('New');
    expect(renamed?.version).toBe(0);
  });

  it('rename returns null for a missing canvas', async () => {
    expect(await canvas.renameCanvas(db, 'does-not-exist', 'X')).toBeNull();
  });

  it('deletes a canvas', async () => {
    const meta = await canvas.createCanvas(db, 'C', owner, 'u1');
    await canvas.deleteCanvas(db, meta.id);
    expect(await canvas.getCanvas(db, meta.id)).toBeNull();
    expect(await canvas.listEvents(db, meta.id)).toHaveLength(0);
  });

  it('scopes listing by user vs workspace', async () => {
    await canvas.createCanvas(db, 'U', { type: 'user', userId: 'u1' }, 'u1');
    await canvas.createCanvas(db, 'W', { type: 'workspace', workspaceId: 'w1' }, 'u1');
    expect((await canvas.listCanvases(db, 'u1')).map((c) => c.name)).toEqual(['U']);
    expect((await canvas.listCanvases(db, 'u1', 'w1')).map((c) => c.name)).toEqual(['W']);
  });

  it('seeds a worked example canvas into a workspace', async () => {
    const meta = await canvas.seedExampleCanvas(db, 'w1', 'u1');
    expect(meta.owner).toEqual({ type: 'workspace', workspaceId: 'w1' });
    const rec = await canvas.getCanvas(db, meta.id);
    expect(rec?.snapshot.nodes.length ?? 0).toBeGreaterThan(0);
  });
});
