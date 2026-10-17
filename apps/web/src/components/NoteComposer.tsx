import { useCallback, useRef, useState } from 'react';
import { useViewport, type Node } from 'reactflow';
import { Check, X } from 'lucide-react';
import { ELEMENT_STYLES, noteMinimumSize, type ElementType } from '../types.js';
import { useI18n } from '../i18n/context.js';

export interface NoteDraft {
  node: Node;
  phase: 'placing' | 'writing';
  visible: boolean;
}

interface NoteComposerProps {
  draft: NoteDraft;
  onCommit: (label: string, select: boolean) => void;
  onCancel: () => void;
}

/** A local sheet of paper. Nothing enters the shared document until it is written. */
export function NoteComposer({ draft, onCommit, onCancel }: NoteComposerProps) {
  const { x, y, zoom } = useViewport();
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const finished = useRef(false);
  const { node, phase } = draft;
  const type = node.type as ElementType;
  const style = ELEMENT_STYLES[type];
  const writing = phase === 'writing';
  const focus = useCallback((el: HTMLTextAreaElement | null) => el?.focus({ preventScroll: true }), []);
  const finish = (select = true) => {
    if (finished.current) return;
    finished.current = true;
    if (label.trim()) onCommit(label.trim(), select);
    else onCancel();
  };
  const cancel = () => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  };

  if (!draft.visible) return null;

  return (
    <div
      data-note-composer
      data-phase={phase}
      className={`absolute left-0 top-0 z-30 ${writing ? 'nodrag nopan' : 'pointer-events-none'}`}
      style={{
        width: node.style?.width,
        height: node.style?.height,
        ...noteMinimumSize(type),
        transform: `translate(${x + node.position.x * zoom}px, ${y + node.position.y * zoom}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <div
        className="sticky-note w-full h-full"
        data-lifted={writing ? 'false' : 'true'}
        data-selected={writing ? 'true' : 'false'}
        style={{ opacity: writing ? 1 : 0.7, boxShadow: '0 0 0 1.5px var(--color-ink), var(--sticky-shadow)' }}
      >
        <div className="sticky-note-paper w-full h-full overflow-hidden p-4" style={{ backgroundColor: style.paperColor }}>
          <div className="sticky-type text-[9px] font-semibold uppercase tracking-wider mb-2.5">{t(`elements.${type}.label`)}</div>
          {writing ? (
            <textarea
              ref={focus}
              aria-label={t('node.writeTitle')}
              placeholder={t(`elements.${type}.newLabel`)}
              value={label}
              style={{ fontSize: Math.max(16, 16 / zoom) }}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={(e) => {
                if (!e.currentTarget.closest('[data-note-composer]')?.contains(e.relatedTarget)) finish(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  finish();
                }
              }}
              className="w-full h-[calc(100%-2rem)] resize-none bg-transparent outline-none text-sm font-semibold leading-snug placeholder:text-ink/50"
            />
          ) : (
            <p className="text-sm text-ink/70">{t('editor.placeHere')}</p>
          )}
        </div>
      </div>
      {writing && (
        <div
          className="note-tools editor-chip absolute top-full left-0 mt-2 flex items-center gap-1 p-1"
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: '0 0' }}
        >
          <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => finish()} title={t('editor.finishWriting')}>
            <Check size={14} />
            <span>{t('editor.finishWriting')}</span>
          </button>
          <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={cancel} aria-label={t('common.cancel')} title={t('common.cancel')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
