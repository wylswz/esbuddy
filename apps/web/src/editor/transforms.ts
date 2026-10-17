import type { Node, NodeChange } from 'reactflow';
import {
  bindingTarget,
  boundToOf,
  isElementType,
  nodeRect,
  OVERLAP_RULES,
  rectsOverlap,
  type Rect,
} from '@esbuddy/sdk';
import { newId } from '../ids';
import { ELEMENT_DEFAULT_SIZE, NOTE_DEFAULT_SIZE, type ElementType } from '../types';

/*
 * Pure `Node[] -> Node[]` transforms behind the editor's aggregate and binding
 * rules. CanvasEditor applies them; the collab binding diffs the result into
 * the shared doc.
 */

export const AGGREGATE_PADDING = 40;

/*
 * Binding invariants (a note stuck onto another — see grammar.ts):
 *   - Dropping an attacher (actor, read model, hot spot) onto exactly one note it can
 *     attach to binds it (`data.boundTo`); several candidates bind nothing.
 *   - While dragging an attacher, the note it would be bound to on drop is highlighted.
 *   - Moving the target moves its attachers along (followDependents).
 *   - Dropping an attacher off its target unbinds it, or rebinds it to the single
 *     new note it lands on (nextBinding). No modifier key involved.
 *   - Deleting the target unbinds its attachers (handleNodeRemovals).
 */

/*
 * Aggregate invariants (enforced across every add / remove / move / resize):
 *
 * 1. Containment — a child never leaves its aggregate's bounds. Enforced by:
 *    - growing the box while a child is dragged outward (growAggregatesForDraggedChildren)
 *    - blocking aggregate resizes that would uncover a child (AggregateNode#shouldResize)
 *    - re-fitting the box on add/remove/drop (fitAggregateToChildren)
 *    To break out, hold Shift while dragging (removes the child instead).
 *
 * 2. No nesting — an aggregate can never contain another aggregate. Enforced by
 *    only letting events/commands join (drop-to-join and grouping alike); the
 *    compiler rejects any other member (`invalid-membership`).
 *
 * 3. Single parent — an element belongs to at most one aggregate (single aggregateId).
 *
 * 4. No orphans — an aggregate left with zero children is removed (removeEmptyAggregates).
 */

export function createNode(type: ElementType, position: { x: number; y: number }, label: string): Node {
  return {
    id: newId(type),
    type,
    position,
    data: { label, type },
    style: ELEMENT_DEFAULT_SIZE[type] ?? { width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE },
  };
}

function aggregateIdOf(n: Node): string | null {
  return (n.data?.aggregateId as string | undefined) || null;
}

export function canJoinAggregate(n: Node): boolean {
  return n.type === 'event' || n.type === 'command';
}

// Notes that bind by being stuck onto another note (actor, read model, hot spot).
export function isAttacher(n: Node): boolean {
  return !!n.type && isElementType(n.type) && !!OVERLAP_RULES[n.type];
}

/** The box covering `nodes`, plus the aggregate padding on every side. */
export function paddedBox(nodes: Node[]): Rect {
  const rects = nodes.map(nodeRect);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return {
    x: minX - AGGREGATE_PADDING,
    y: minY - AGGREGATE_PADDING,
    w: maxX - minX + AGGREGATE_PADDING * 2,
    h: maxY - minY + AGGREGATE_PADDING * 2,
  };
}

function withBox(n: Node, b: Rect): Node {
  return { ...n, position: { x: b.x, y: b.y }, style: { ...n.style, width: b.w, height: b.h } };
}

/** The first aggregate (other than `except`) that `node` overlaps. */
export function aggregateUnder(node: Node, nds: Node[], except: string | null = null): Node | undefined {
  const r = nodeRect(node);
  return nds.find((n) => n.type === 'aggregate' && n.id !== except && rectsOverlap(r, nodeRect(n)));
}

export function isNodeCenterOutside(node: Node, agg: Node): boolean {
  const r = nodeRect(node);
  const b = nodeRect(agg);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h;
}

// Grow/shrink an aggregate so its box covers all of its children (with padding).
export function fitAggregateToChildren(nds: Node[], aggId: string): Node[] {
  const children = nds.filter((n) => aggregateIdOf(n) === aggId);
  if (children.length === 0) return nds;
  const box = paddedBox(children);
  return nds.map((n) => (n.id === aggId ? withBox(n, box) : n));
}

// Grow (never shrink) an aggregate so it covers all of its children.
function growAggregateToContainChildren(nds: Node[], aggId: string): Node[] {
  const agg = nds.find((n) => n.id === aggId);
  const children = nds.filter((n) => aggregateIdOf(n) === aggId);
  if (!agg || children.length === 0) return nds;

  const b = nodeRect(agg);
  const c = paddedBox(children);
  const left = Math.min(b.x, c.x);
  const top = Math.min(b.y, c.y);
  const right = Math.max(b.x + b.w, c.x + c.w);
  const bottom = Math.max(b.y + b.h, c.y + c.h);
  if (left === b.x && top === b.y && right === b.x + b.w && bottom === b.y + b.h) return nds;

  const grown = { x: left, y: top, w: right - left, h: bottom - top };
  return nds.map((n) => (n.id === aggId ? withBox(n, grown) : n));
}

export function removeEmptyAggregates(nds: Node[]): Node[] {
  const childCount = new Map<string, number>();
  nds.forEach((n) => {
    const aggId = aggregateIdOf(n);
    if (aggId) childCount.set(aggId, (childCount.get(aggId) ?? 0) + 1);
  });
  return nds.filter((n) => n.type !== 'aggregate' || (childCount.get(n.id) ?? 0) > 0);
}

function draggingIdsOf(changes: NodeChange[]): Set<string> {
  const ids = new Set<string>();
  for (const c of changes) if (c.type === 'position' && c.dragging) ids.add(c.id);
  return ids;
}

// The node a note moves with: the note it is bound to, else its aggregate.
function parentOf(n: Node | undefined): string | null {
  return n ? (boundToOf(n) ?? aggregateIdOf(n)) : null;
}

// While a node is dragged, everything hanging from it moves by the same delta:
// an aggregate's members, a note's bound attachers, and theirs in turn.
export function followDependents(prevNodes: Node[], nextNodes: Node[], changes: NodeChange[]): Node[] {
  const movedIds = draggingIdsOf(changes);
  if (movedIds.size === 0) return nextNodes;

  const prevById = new Map(prevNodes.map((n) => [n.id, n]));
  const nextById = new Map(nextNodes.map((n) => [n.id, n]));
  const deltas = new Map<string, { dx: number; dy: number }>();
  movedIds.forEach((id) => {
    const p = prevById.get(id);
    const n = nextById.get(id);
    if (p && n) deltas.set(id, { dx: n.position.x - p.position.x, dy: n.position.y - p.position.y });
  });

  const deltaOf = (id: string, depth = 0): { dx: number; dy: number } | undefined => {
    if (deltas.has(id)) return deltas.get(id);
    const parent = depth < 8 ? parentOf(nextById.get(id)) : null;
    const d = parent ? deltaOf(parent, depth + 1) : undefined;
    if (d) deltas.set(id, d);
    return d;
  };

  return nextNodes.map((n) => {
    if (movedIds.has(n.id)) return n;
    const d = deltaOf(n.id);
    return d && (d.dx || d.dy) ? { ...n, position: { x: n.position.x + d.dx, y: n.position.y + d.dy } } : n;
  });
}

// While a child is dragged outward, expand its aggregate to keep it inside (unless removing).
export function growAggregatesForDraggedChildren(nextNodes: Node[], changes: NodeChange[], constrain: boolean): Node[] {
  if (!constrain) return nextNodes;
  const draggingIds = draggingIdsOf(changes);
  if (draggingIds.size === 0) return nextNodes;

  const affectedAggIds = new Set<string>();
  nextNodes.forEach((n) => {
    const aggId = draggingIds.has(n.id) ? aggregateIdOf(n) : null;
    if (aggId) affectedAggIds.add(aggId);
  });

  let result = nextNodes;
  affectedAggIds.forEach((aggId) => {
    result = growAggregateToContainChildren(result, aggId);
  });
  return result;
}

// When nodes are deleted, detach orphaned children, remove empty aggregates and re-fit the rest.
export function handleNodeRemovals(prevNodes: Node[], nextNodes: Node[], changes: NodeChange[]): Node[] {
  const removedIds = new Set<string>();
  for (const change of changes) {
    if (change.type === 'remove') removedIds.add(change.id);
  }
  if (removedIds.size === 0) return nextNodes;

  // Deleting a note unbinds whatever was stuck onto it.
  let result = nextNodes.map((n) => {
    const b = boundToOf(n);
    return b && removedIds.has(b) ? { ...n, data: { ...n.data, boundTo: null } } : n;
  });
  const affectedAggIds = new Set<string>();

  removedIds.forEach((id) => {
    const removed = prevNodes.find((n) => n.id === id);
    if (!removed) return;

    if (removed.type === 'aggregate') {
      // Deleting an aggregate detaches its children rather than deleting them.
      result = result.map((n) =>
        aggregateIdOf(n) === removed.id ? { ...n, data: { ...n.data, aggregateId: null } } : n,
      );
      return;
    }

    const aggId = aggregateIdOf(removed);
    if (aggId) affectedAggIds.add(aggId);
  });

  result = removeEmptyAggregates(result);
  affectedAggIds.forEach((id) => {
    result = fitAggregateToChildren(result, id);
  });
  return result;
}

// Add a note; one created right on top of a note it can attach to is bound to it.
export function addNoteBound(nds: Node[], node: Node): Node[] {
  const target = bindingTarget(node, nds);
  return [...nds, target ? { ...node, data: { ...node.data, boundTo: target } } : node];
}

export function setBinding(nds: Node[], id: string, target: string | null): Node[] {
  const node = nds.find((n) => n.id === id);
  if (!node || boundToOf(node) === target) return nds;
  const updated = { ...node, data: { ...node.data, boundTo: target } };
  return target ? [...nds.filter((n) => n.id !== id), updated] : nds.map((n) => (n.id === id ? updated : n));
}
