import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useCanvasActions } from '../CanvasContext';

interface StickyNodeData {
  label: string;
  type: ElementType;
  description?: string;
  [key: string]: unknown;
}

function StickyNodeComponent({ id, data, selected }: NodeProps<StickyNodeData>) {
  const style = ELEMENT_STYLES[data.type];
  const { updateNodeLabel } = useCanvasActions();

  return (
    <div className="relative" style={{ width: 180 }}>
      <Handle type="target" position={Position.Left} style={{ background: style.color }} />
      <Handle type="source" position={Position.Right} style={{ background: style.color }} />

      {/* Paper body (only the paper tilts; handles stay axis-aligned) */}
      <div
        className="relative px-4 pt-3 pb-3"
        style={{
          width: 180,
          minHeight: 84,
          backgroundColor: style.bgColor,
          border: `1px solid ${style.borderColor}`,
          borderBottom: `3px solid ${style.borderColor}`,
          borderRadius: '3px',
          transform: selected ? 'rotate(-0.5deg)' : 'rotate(-1deg)',
          boxShadow:
            '0 5px 12px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
          backgroundImage: `
            linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 45%),
            linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.025) 100%)
          `,
        }}
      >
        {/* Tape strip */}
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-[2px]"
          style={{
            backgroundColor: `${style.color}66`,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
          }}
        />

        {/* Type badge */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-xs leading-none" style={{ color: style.color }}>{style.icon}</span>
          <span
            className="text-[9px] font-bold uppercase tracking-wider leading-none"
            style={{ color: style.color }}
          >
            {style.label}
          </span>
        </div>

        {/* Editable label */}
        <div
          className="text-sm font-medium text-gray-800 leading-snug break-words whitespace-pre-wrap outline-none"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => updateNodeLabel(id, e.currentTarget.innerText.trim())}
        >
          {data.label}
        </div>

        {data.description && (
          <div className="text-xs text-gray-500 mt-1 break-words leading-snug">{data.description}</div>
        )}

        {/* Bottom-right curled corner */}
        <div
          className="absolute -bottom-px -right-px w-4 h-4 pointer-events-none"
          style={{
            background: 'linear-gradient(225deg, transparent 50%, rgba(0, 0, 0, 0.09) 50%)',
            borderRadius: '0 0 3px 0',
          }}
        />
      </div>
    </div>
  );
}

export const StickyNode = memo(StickyNodeComponent);
