import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCanvasEdits, canvasRevision, CanvasEditError, docFromSnapshot, docToSnapshot, getNodesMap, getVotesMap, nodeRect,
} from '@esbuddy/sdk';
import { canvasEditsSchema } from '@esbuddy/sdk/agent';

describe('incremental agent edits', () => {
  let doc: Y.Doc;
  beforeEach(() => { doc = docFromSnapshot({ nodes: [], edges: [], viewport: null }); });
  afterEach(() => doc.destroy());
  const add = (id: string, type = 'note', x = 0, y = 0) => ({
    op: 'add_node', id, type, label: id, position: { x, y },
  });
  const edit = (operations: unknown[], expectedRevision?: string) => {
    applyCanvasEdits(doc, canvasEditsSchema.parse({ operations, expectedRevision }));
  };
  const node = (id: string) => docToSnapshot(doc).nodes.find((node) => node.id === id)!;

  it('adds and patches only specified fields in a single transaction', () => {
    edit([add('event', 'event'), add('command', 'command', 300), { op: 'add_edge', id: 'edge', source: 'command', target: 'event' }]);
    const element = getNodesMap(doc).get('event');
    const update = vi.fn();
    doc.on('update', update);
    edit([
      { op: 'update_node', id: 'event', patch: { label: 'Order placed' } },
      { op: 'update_node', id: 'command', patch: { description: 'Requested by a customer' } },
    ]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(getNodesMap(doc).get('event')).toBe(element);
    expect(node('event')).toMatchObject({ position: { x: 0, y: 0 }, data: { label: 'Order placed' } });
    expect(docToSnapshot(doc).edges).toHaveLength(1);
  });

  it('plans before mutating because Yjs transactions do not roll back', () => {
    const revision = canvasRevision(doc);
    expect(() => edit([
      add('idea'), { op: 'add_edge', id: 'illegal', source: 'idea', target: 'missing' },
    ])).toThrow(CanvasEditError);
    expect(docToSnapshot(doc).nodes).toEqual([]);
    expect(canvasRevision(doc)).toBe(revision);
  });

  it('conflicts rather than overwriting IDs, including delete-and-recreate in one batch', () => {
    edit([add('idea')]);
    for (const operations of [
      [add('idea')],
      [{ op: 'delete_node', id: 'idea' }, add('idea', 'event')],
      [add('new'), { op: 'delete_node', id: 'new' }, add('new')],
    ]) expect(() => edit(operations)).toThrow(CanvasEditError);
    expect(node('idea').type).toBe('note');
    expect(docToSnapshot(doc).nodes).toHaveLength(1);
  });

  it('rejects stale revisions after additions and after deletion-only edits', () => {
    const empty = canvasRevision(doc);
    edit([add('idea')], empty);
    const populated = canvasRevision(doc);
    expect(() => edit([add('stale')], empty)).toThrow('Canvas changed');
    edit([{ op: 'delete_node', id: 'idea' }], populated);
    expect(canvasRevision(doc)).not.toBe(populated);
    expect(() => edit([add('also-stale')], populated)).toThrow('Canvas changed');
    edit([add('fresh')], canvasRevision(doc));
    expect(node('fresh')).toBeDefined();
  });

  it('moves binding dependents with their target and explicitly detaches a moved attacher', () => {
    edit([
      add('command', 'command'),
      { ...add('actor', 'actor', 10), boundTo: 'command' },
      { ...add('hotspot', 'hotspot', 20), boundTo: 'actor' },
    ]);
    edit([{ op: 'update_node', id: 'command', patch: { position: { x: 100, y: 50 } } }]);
    expect(node('actor').position).toEqual({ x: 110, y: 50 });
    expect(node('hotspot').position).toEqual({ x: 120, y: 50 });
    edit([{ op: 'update_node', id: 'actor', patch: { position: { x: 500, y: 500 } } }]);
    expect(node('actor').data.boundTo).toBeUndefined();
    expect(node('hotspot').position).toEqual({ x: 510, y: 500 });
  });

  it('keeps aggregate members inside the group and moves the group together', () => {
    edit([add('group', 'aggregate'), { ...add('event', 'event', 100, 100), aggregateId: 'group' }]);
    edit([{ op: 'update_node', id: 'event', patch: { position: { x: 900, y: 100 } } }]);
    const group = nodeRect(node('group'));
    const child = nodeRect(node('event'));
    expect(group.x + group.w).toBeGreaterThanOrEqual(child.x + child.w);
    edit([{ op: 'update_node', id: 'group', patch: { position: { x: group.x + 100, y: group.y + 100 } } }]);
    expect(node('event').position).toEqual({ x: 1000, y: 200 });
    edit([{ op: 'delete_node', id: 'event' }]);
    expect(docToSnapshot(doc).nodes).toEqual([]);
  });

  it('removes incident edges and dangling bindings without deleting other notes or vote history', () => {
    edit([
      add('command', 'command'), add('event', 'event', 300),
      { ...add('actor', 'actor'), boundTo: 'command' },
      { ...add('hotspot', 'hotspot'), boundTo: 'command' },
      { op: 'add_edge', id: 'edge', source: 'command', target: 'event' },
    ]);
    getVotesMap(doc).set('hotspot agent:expert', { nodeId: 'hotspot', userId: 'agent:expert', name: 'Expert' });
    edit([{ op: 'delete_node', id: 'command' }]);
    expect(node('actor').data.boundTo).toBeUndefined();
    expect(node('hotspot').data.boundTo).toBeUndefined();
    expect(docToSnapshot(doc).edges).toEqual([]);
    edit([{ op: 'delete_node', id: 'hotspot' }]);
    expect(getVotesMap(doc).size).toBe(1);
  });

  it('rejects illegal bindings, memberships and edges, but permits incomplete brainstorming', () => {
    for (const operations of [
      [add('group', 'aggregate')],
      [add('group', 'aggregate'), { ...add('actor', 'actor'), aggregateId: 'group' }],
      [add('event', 'event'), { ...add('actor', 'actor'), boundTo: 'event' }],
      [add('a', 'event'), add('b', 'event'), { op: 'add_edge', id: 'bad', source: 'a', target: 'b' }],
    ]) expect(() => edit(operations)).toThrow(CanvasEditError);
    edit([add('policy', 'policy')]); // A missing trigger/action is for analysis, not write validation.
    expect(node('policy').type).toBe('policy');
  });

  it('strictly validates payloads and batch limits before they reach the room', () => {
    for (const value of [
      { operations: [] }, { operations: Array.from({ length: 101 }, (_, i) => add(`n${i}`)) },
      { operations: [{ ...add('idea'), identity: { name: 'Spoofed' } }] },
      { operations: [{ ...add('idea'), position: { x: Infinity, y: 0 } }] },
      { operations: [{ op: 'replace_snapshot', nodes: [] }] },
    ]) expect(canvasEditsSchema.safeParse(value).success).toBe(false);
  });
});
