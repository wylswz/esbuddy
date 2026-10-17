import { useMemo, type ReactNode } from 'react';
import ReactFlow, { Controls, MarkerType, MiniMap, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { isStructureEmpty, type CanvasSnapshot } from '@esbuddy/sdk';
import { CanvasActionsContext, type CanvasActions } from '../CanvasContext';
import { toFlowEdge, toFlowNode } from '../collab/binding';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { nodeTypes } from './nodeTypes';
import { BoardStructure, RULER_SIZE, Rulers } from './StructureRulers';

const READ_ONLY_ACTIONS: CanvasActions = {
  updateNodeLabel: () => {},
  updateNodeDescription: () => {},
  readOnly: true,
};

const NO_STRUCTURE = { lanes: [], milestones: [] };

interface ReadOnlyBoardProps {
  snapshot: CanvasSnapshot;
  /**
   * `full`: pan and zoom, with controls and (optionally) a minimap — a published version.
   * `static`: a fixed, fitted picture — the guide's examples.
   */
  variant?: 'full' | 'static';
  minimap?: boolean;
  /** Rendered over the board, inside the ruler inset (page chrome). */
  overlay?: ReactNode;
}

/**
 * A canvas snapshot rendered with the real board (same notes, rulers, bands)
 * but nothing editable. Used by published versions and the guide's examples.
 */
export function ReadOnlyBoard({ snapshot, variant = 'full', minimap = false, overlay }: ReadOnlyBoardProps) {
  const nodes = useMemo(() => snapshot.nodes.map(toFlowNode), [snapshot]);
  const edges = useMemo(() => snapshot.edges.map(toFlowEdge), [snapshot]);
  const structure = snapshot.structure ?? NO_STRUCTURE;
  const inset = isStructureEmpty(structure) ? 0 : RULER_SIZE;
  const full = variant === 'full';

  return (
    <ReactFlowProvider>
      <div className="w-full h-full relative">
        {inset > 0 && <Rulers structure={structure} />}
        <div className="absolute right-0 bottom-0" style={{ top: inset, left: inset }}>
          {overlay}
          <CanvasActionsContext.Provider value={READ_ONLY_ACTIONS}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              panOnDrag={full}
              panOnScroll={full}
              zoomOnScroll={false}
              zoomOnPinch={full}
              zoomOnDoubleClick={full}
              preventScrolling={full}
              fitView
              fitViewOptions={full ? undefined : { padding: 0.08 }}
              minZoom={0.05}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              className="esboard-surface"
            >
              <BoardStructure structure={structure} />
              {full && <Controls showInteractive={false} />}
              {full && minimap && (
                <MiniMap
                  nodeColor={(node) => ELEMENT_STYLES[node.type as ElementType]?.color ?? 'var(--color-board-line)'}
                  className="bg-surface border border-border rounded"
                />
              )}
            </ReactFlow>
          </CanvasActionsContext.Provider>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
