import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CanvasMeta, Store } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { CanvasThumbnail } from './CanvasThumbnail';

interface CanvasCardProps {
  store: Store;
  canvas: CanvasMeta;
  /** Position in the grid; drives the staggered entrance animation. */
  index: number;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const STAGGER_MS = 50;
const MAX_STAGGER_STEPS = 12;

function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function CanvasCard({ store, canvas, index, onOpen, onRename, onDelete }: CanvasCardProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(canvas.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(canvas.name);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== canvas.name) onRename(canvas.id, next);
  };

  return (
    <div
      onClick={() => !editing && onOpen(canvas.id)}
      className="group relative flex flex-col h-44 rounded-md bg-surface border border-ink/10 hover:border-ink hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(28,25,23,0.35)] active:translate-y-0 active:shadow-none transition-[border-color,transform,box-shadow] cursor-pointer overflow-hidden card-enter"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms` }}
    >
      <CanvasThumbnail store={store} canvasId={canvas.id} />
      <div className="px-4 py-3 border-t border-ink/10">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
            placeholder={t('home.untitled')}
            className="w-full text-sm font-semibold text-ink bg-transparent border-b border-ink focus:outline-none"
          />
        ) : (
          <div className="text-sm font-semibold text-ink truncate">{canvas.name}</div>
        )}
        {canvas.updatedAt > 0 && (
          <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle mt-1">
            {t('home.updated')} {formatDate(canvas.updatedAt)}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          className="h-8 w-8 flex items-center justify-center rounded-md bg-paper/90 backdrop-blur border border-ink/10 text-fg-muted hover:bg-ink hover:text-paper hover:border-ink transition-colors"
          title={t('home.rename')}
          aria-label={t('home.rename')}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(canvas.id);
          }}
          className="h-8 w-8 flex items-center justify-center rounded-md bg-paper/90 backdrop-blur border border-ink/10 text-fg-muted hover:bg-danger hover:text-paper hover:border-danger transition-colors"
          title={t('home.delete')}
          aria-label={t('home.delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/** Same footprint as CanvasCard, shown while the list is loading. */
export function CanvasCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="h-44 rounded-md bg-surface border border-ink/10 overflow-hidden card-enter"
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
    >
      <div className="h-[calc(100%-4.25rem)] bg-surface-muted animate-pulse" />
      <div className="px-4 py-3 space-y-2">
        <div className="h-3.5 w-2/3 rounded-sm bg-surface-muted animate-pulse" />
        <div className="h-2.5 w-1/3 rounded-sm bg-surface-muted animate-pulse" />
      </div>
    </div>
  );
}
