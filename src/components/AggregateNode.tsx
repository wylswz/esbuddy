import { memo, useCallback } from 'react';
import {
  NodeResizeControl,
  useStoreApi,
  type NodeProps,
  type ShouldResize,
} from 'reactflow';
import { ELEMENT_STYLES } from '../types';
import { useCanvasActions } from '../CanvasContext';

interface AggregateNodeData {
  label: string;
  type: 'aggregate';
  [key: string]: unknown;
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

function AggregateNodeComponent({ id, data, selected }: NodeProps<AggregateNodeData>) {
  const store = useStoreApi();
  const { updateNodeLabel } = useCanvasActions();
  const style = ELEMENT_STYLES.aggregate;

  // Block any resize that would leave a child outside the boundary box.
  const shouldResize: ShouldResize = useCallback(
    (_event, params) => {
      const { x, y, width, height } = params;
      const { nodeInternals } = store.getState();

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hasChildren = false;

      nodeInternals.forEach((node) => {
        if (node.data?.aggregateId === id) {
          hasChildren = true;
          const w = node.width ?? 0;
          const h = node.height ?? 0;
          minX = Math.min(minX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxX = Math.max(maxX, node.position.x + w);
          maxY = Math.max(maxY, node.position.y + h);
        }
      });

      if (!hasChildren) return true;
      return x <= minX && y <= minY && x + width >= maxX && y + height >= maxY;
    },
    [id, store],
  );

  return (
    <div className="relative w-full h-full min-w-[200px] min-h-[120px]">
      {selected &&
        CORNERS.map((position) => (
          <NodeResizeControl
            key={position}
            position={position}
            color={style.color}
            minWidth={10}
            minHeight={10}
            shouldResize={shouldResize}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        ))}

      {/* Semi-transparent boundary box */}
      <div
        className="w-full h-full"
        style={{
          backgroundColor: selected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
          border: `2px dashed ${style.borderColor}`,
          borderRadius: '12px',
        }}
      />

      {/* Label tag */}
      <div
        className="absolute top-2 left-2 flex items-center gap-1 rounded-md px-2 py-0.5"
        style={{
          backgroundColor: style.bgColor,
          color: style.color,
          border: `1px solid ${style.borderColor}`,
        }}
      >
        <span className="text-xs">{style.icon}</span>
        <span
          className="text-xs font-semibold uppercase tracking-wide outline-none"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => {
            updateNodeLabel(id, e.currentTarget.innerText.trim());
          }}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}

export const AggregateNode = memo(AggregateNodeComponent);
