import { StickyNode } from './StickyNode';
import { AggregateNode } from './AggregateNode';

/** React Flow node renderers, shared by the editor and the read-only version view. */
export const nodeTypes = {
  event: StickyNode,
  command: StickyNode,
  aggregate: AggregateNode,
  actor: StickyNode,
  policy: StickyNode,
  external: StickyNode,
  hotspot: StickyNode,
  readmodel: StickyNode,
  note: StickyNode,
};
