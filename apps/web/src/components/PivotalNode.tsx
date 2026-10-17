import { memo, useCallback, useState } from 'react';
import { Handle, NodeResizeControl, Position, useStore, type NodeProps } from 'reactflow';
import { ELEMENT_STYLES } from '../types';
import { diagnosticColor, useCanvasActions, useNodeDiagnostic, useRemoteSelection } from '../CanvasContext';
import { useI18n } from '../i18n/context';

interface PivotalNodeData {
  label: string;
  [key: string]: unknown;
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const HIDDEN_HANDLE = { opacity: 0, pointerEvents: 'none' } as const;
const TAPE_MIN = 20;
const TEETH = 6;
const TOOTH = 4;

/** Torn ends of a strip of tape: zig-zags along the two short edges. */
function tornEdges(vertical: boolean): string {
  const steps = Array.from({ length: TEETH + 1 }, (_, i) => ({ p: `${(i / TEETH) * 100}%`, d: i % 2 ? 0 : TOOTH }));
  const back = [...steps].reverse();
  const pts = vertical
    ? [...steps.map(({ p, d }) => `${p} ${d}px`), ...back.map(({ p, d }) => `${p} calc(100% - ${d}px)`)]
    : [...steps.map(({ p, d }) => `calc(100% - ${d}px) ${p}`), ...back.map(({ p, d }) => `${d}px ${p}`)];
  return `polygon(${pts.join(', ')})`;
}

const CLIP = { vertical: tornEdges(true), horizontal: tornEdges(false) };

/**
 * Pivotal event: a strip of translucent yellow tape stuck across an event (an
 * attacher, see grammar.ts). Long and thin; its label is optional.
 */
function PivotalNodeComponent({ id, data, selected }: NodeProps<PivotalNodeData>) {
  const style = ELEMENT_STYLES.pivotal;
  const { updateNodeLabel, readOnly } = useCanvasActions();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const vertical = useStore((s) => {
    const n = s.nodeInternals.get(id);
    return !n?.width || !n.height || n.height >= n.width;
  });
  const remoteColor = useRemoteSelection(id)[0]?.color;
  const diagColor = diagnosticColor(useNodeDiagnostic(id));
  const ring = diagColor ?? remoteColor ?? (selected ? style.color : null);

  const focusAndSelect = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div
      className="relative w-full h-full"
      style={{
        minWidth: TAPE_MIN,
        minHeight: TAPE_MIN,
        outline: ring ? `2px solid ${ring}` : undefined,
        outlineOffset: 3,
        filter: 'drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.18))',
      }}
    >
      {/* Tape takes no edges; hidden handles only let legacy edges render so they can be deleted. */}
      <Handle type="target" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />

      {selected &&
        CORNERS.map((position) => (
          <NodeResizeControl
            key={position}
            position={position}
            color={style.color}
            minWidth={TAPE_MIN}
            minHeight={TAPE_MIN}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        ))}

      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{
          clipPath: vertical ? CLIP.vertical : CLIP.horizontal,
          backgroundColor: style.bgColor,
          opacity: 0.88,
          backgroundImage: `repeating-linear-gradient(${vertical ? '0deg' : '90deg'}, rgba(255,255,255,0.18) 0 2px, rgba(255,255,255,0) 2px 7px)`,
        }}
      >
        {editing ? (
          <input
            ref={focusAndSelect}
            type="text"
            defaultValue={data.label}
            className="w-full bg-transparent outline-none text-[11px] font-semibold text-fg text-center px-1"
            onBlur={(e) => {
              updateNodeLabel(id, e.currentTarget.value.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider text-fg/80 whitespace-nowrap select-none${readOnly ? '' : ' cursor-text'}`}
            style={vertical ? { writingMode: 'vertical-rl' } : undefined}
            title={readOnly ? t('elements.pivotal.label') : t('node.doubleClickEdit')}
            onDoubleClick={readOnly ? undefined : () => setEditing(true)}
          >
            {data.label || t('elements.pivotal.label')}
          </span>
        )}
      </div>
    </div>
  );
}

export const PivotalNode = memo(PivotalNodeComponent);
