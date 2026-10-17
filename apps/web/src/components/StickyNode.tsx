import { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeResizeControl, type NodeProps } from 'reactflow';
import { hasIncomingEdges, hasOutgoingEdges, isVotable } from '@esbuddy/sdk';
import { ELEMENT_STYLES, NOTE_MIN_SIZE, type ElementType } from '../types';
import {
  diagnosticColor,
  useCanvasActions,
  useDropTarget,
  useNodeDiagnostic,
  useRemoteSelection,
} from '../CanvasContext';
import { useI18n } from '../i18n/context';
import { VoteBadge } from './VoteBadge';

interface StickyNodeData {
  label: string;
  type: ElementType;
  description?: string;
  [key: string]: unknown;
}

type EditField = 'title' | 'memo';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const HIDDEN_HANDLE = { opacity: 0, pointerEvents: 'none' } as const;

function StickyNodeComponent({ id, type, data, selected, dragging }: NodeProps<StickyNodeData>) {
  const style = ELEMENT_STYLES[data.type];
  const { updateNodeLabel, updateNodeDescription, readOnly } = useCanvasActions();
  const { t } = useI18n();
  const [editing, setEditing] = useState<EditField | null>(null);
  const lifted = selected || dragging;
  const votable = isVotable(type);
  // Peers who have this note selected: outline it in their colour.
  const remotePeers = useRemoteSelection(id);
  const remoteRing = remotePeers.length > 0 ? `0 0 0 2.5px ${remotePeers[0].color}` : null;
  // Compiler diagnostic on this note: a ring outside the peer ring, if any.
  const diagColor = diagnosticColor(useNodeDiagnostic(id));
  const diagRing = diagColor ? `0 0 0 ${remoteRing ? 5.5 : 3}px ${diagColor}` : null;
  // The note a dragged attacher would bind to on drop.
  const bindRing = useDropTarget() === id ? '0 0 0 3px var(--color-accent), 0 0 18px var(--color-accent)' : null;

  const focusAndSelect = useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div
      className="sticky-node relative w-full h-full"
      data-readonly={readOnly ? 'true' : 'false'}
      style={{ minWidth: NOTE_MIN_SIZE, minHeight: NOTE_MIN_SIZE }}
    >
      {/*
        Only the ends the grammar allows are usable (an actor only starts edges, a hot
        spot has none). Disallowed handles stay mounted, hidden, so legacy illegal
        edges still render and can be found and deleted.
      */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={hasIncomingEdges(type)}
        style={hasIncomingEdges(type) ? { background: style.color } : HIDDEN_HANDLE}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={hasOutgoingEdges(type)}
        style={hasOutgoingEdges(type) ? { background: style.color } : HIDDEN_HANDLE}
      />

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
        className="sticky-note relative w-full h-full"
        data-lifted={lifted ? 'true' : 'false'}
        data-readonly={readOnly ? 'true' : 'false'}
        style={{
          boxShadow: [bindRing, remoteRing, diagRing, 'var(--sticky-shadow)']
            .filter(Boolean)
            .join(', '),
        }}
      >
        <div
          className="sticky-note-paper relative overflow-hidden w-full h-full"
          style={{
            // Hot spots keep room at the bottom for the vote badge.
            padding: votable ? '16px 16px 28px' : '16px 16px 18px',
            backgroundColor: style.paperColor,
          }}
        >
          {/* Quiet printed type label; the paper itself carries the colour. */}
          <div className="mb-2.5">
            <span className="sticky-type text-[9px] font-semibold uppercase tracking-wider leading-none">
              {t(`elements.${data.type}.label`)}
            </span>
          </div>

          {/* Title */}
          {editing === 'title' ? (
            <input
              ref={focusAndSelect}
              type="text"
              defaultValue={data.label}
              className="w-full bg-transparent outline-none text-sm font-semibold leading-snug"
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
              className={`sticky-title text-sm font-semibold leading-snug break-words whitespace-pre-wrap${readOnly ? '' : ' cursor-text'}`}
              title={readOnly ? undefined : t('node.doubleClickEdit')}
              onDoubleClick={readOnly ? undefined : () => setEditing('title')}
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
              className="sticky-memo w-full bg-transparent outline-none resize-none text-xs leading-relaxed mt-2"
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
              className={`sticky-memo text-xs leading-relaxed break-words whitespace-pre-wrap mt-2${readOnly ? '' : ' cursor-text'}`}
              title={readOnly ? undefined : t('node.doubleClickEditMemo')}
              onDoubleClick={readOnly ? undefined : () => setEditing('memo')}
            >
              {data.description || (!readOnly && <span className="sticky-placeholder">{t('node.memoPlaceholder')}</span>)}
            </div>
          )}

          {votable && <VoteBadge nodeId={id} />}
        </div>
      </div>
    </div>
  );
}

export const StickyNode = memo(StickyNodeComponent);
