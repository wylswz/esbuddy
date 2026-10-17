import { Background, BackgroundVariant } from 'reactflow';

/**
 * The board's dot grid: sparse, small, warm-grey dots for a sense of order
 * without lines, so swimlanes and milestones (solid lines) never read as part
 * of the grid. Dot colour lives in index.css (`.esboard-dots`). Must be the
 * first child of <ReactFlow> so it sits beneath the board structure.
 */
export function BoardBackground() {
  return <Background variant={BackgroundVariant.Dots} gap={24} size={1.6} className="esboard-dots" />;
}
