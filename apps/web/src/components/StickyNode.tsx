import { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeResizeControl, type NodeProps } from 'reactflow';
import { ELEMENT_STYLES, NOTE_MIN_SIZE, type ElementType } from '../types';
import { useCanvasActions } from '../CanvasContext';
import { useI18n } from '../i18n/context';
import { ColorDot } from './ColorDot';

interface StickyNodeData {
  label: string;
  type: ElementType;
  description?: string;
  [key: string]: unknown;
}

type EditField = 'title' | 'memo';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

function StickyNodeComponent({ id, data, selected, dragging }: NodeProps<StickyNodeData>) {
  const style = ELEMENT_STYLES[data.type];
  const { updateNodeLabel, updateNodeDescription } = useCanvasActions();
  const { t } = useI18n();
  const [editing, setEditing] = useState<EditField | null>(null);
  const lifted = selected || dragging;

  const focusAndSelect = useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div
      className="relative w-full h-full"
      style={{ minWidth: NOTE_MIN_SIZE, minHeight: NOTE_MIN_SIZE }}
    >
      <Handle type="target" position={Position.Left} style={{ background: style.color }} />
      <Handle type="source" position={Position.Right} style={{ background: style.color }} />

      {selected &&
        CORNERS.map((position) => (
          <NodeResizeControl
            key={position}
            position={position}
            color={style.color}
            minWidth={NOTE_MIN_SIZE}
            minHeight={NOTE_MIN_SIZE}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        ))}

      {/* Square paper note */}
      <div
        className="sticky-note relative overflow-hidden w-full h-full"
        data-lifted={lifted ? 'true' : 'false'}
        style={{
          padding: '12px 14px 16px',
          backgroundColor: style.bgColor,
          borderRadius: '2px',
          boxShadow: lifted
            ? '0 2px 4px rgba(0, 0, 0, 0.14), 0 7px 16px rgba(0, 0, 0, 0.16), 0 18px 36px rgba(0, 0, 0, 0.18)'
            : '0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 9px rgba(0, 0, 0, 0.10), 0 10px 22px rgba(0, 0, 0, 0.12)',
          backgroundImage: 'radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 55%)',
        }}
      >
        {/* Adhesive band along the top edge */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0))',
            borderRadius: '2px 2px 0 0',
          }}
        />

        {/* Type badge */}
        <div className="flex items-center gap-1 mb-1.5">
          <ColorDot color={style.color} />
          <span
            className="text-[9px] font-bold uppercase tracking-wider leading-none"
            style={{ color: style.color }}
          >
            {t(`elements.${data.type}.label`)}
          </span>
        </div>

        {/* Title */}
        {editing === 'title' ? (
          <input
            ref={focusAndSelect}
            type="text"
            defaultValue={data.label}
            className="w-full bg-transparent outline-none text-sm font-semibold text-gray-800 leading-snug"
            onBlur={(e) => {
              updateNodeLabel(id, e.currentTarget.value.trim());
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <div
            className="sticky-title text-sm font-semibold text-gray-800 leading-snug break-words whitespace-pre-wrap cursor-text"
            title={t('node.doubleClickEdit')}
            onDoubleClick={() => setEditing('title')}
          >
            {data.label}
          </div>
        )}

        {/* Memo / notes */}
        {editing === 'memo' ? (
          <textarea
            ref={focusAndSelect}
            defaultValue={data.description}
            rows={4}
            className="w-full bg-transparent outline-none resize-none text-xs text-gray-500 leading-snug mt-1.5"
            onBlur={(e) => {
              updateNodeDescription(id, e.currentTarget.value.trim());
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <div
            className="sticky-memo text-xs text-gray-500 leading-snug break-words whitespace-pre-wrap cursor-text mt-1.5"
            title={t('node.doubleClickEditMemo')}
            onDoubleClick={() => setEditing('memo')}
          >
            {data.description || <span style={{ color: '#b0b3b8' }}>{t('node.memoPlaceholder')}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export const StickyNode = memo(StickyNodeComponent);
