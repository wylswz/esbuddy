import { Trash2 } from 'lucide-react';
import type { CanvasMeta, Store } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { CanvasThumbnail } from './CanvasThumbnail';

interface CanvasCardProps {
  store: Store;
  canvas: CanvasMeta;
  /** Position in the grid; drives the staggered entrance animation. */
  index: number;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

const STAGGER_MS = 50;
const MAX_STAGGER_STEPS = 12;

function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function CanvasCard({ store, canvas, index, onOpen, onDelete }: CanvasCardProps) {
  const { t } = useI18n();

  return (
    <div
      onClick={() => onOpen(canvas.id)}
      className="group relative flex flex-col h-40 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all cursor-pointer overflow-hidden card-enter"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms` }}
    >
      <CanvasThumbnail store={store} canvasId={canvas.id} />
      <div className="p-3 border-t border-gray-100">
        <div className="text-sm font-medium text-gray-800 truncate">{canvas.name}</div>
        {canvas.updatedAt > 0 && (
          <div className="text-xs text-gray-400 mt-0.5">
            {t('home.updated')} {formatDate(canvas.updatedAt)}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(canvas.id);
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-white shadow-sm transition-all"
        title={t('home.delete')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/** Same footprint as CanvasCard, shown while the list is loading. */
export function CanvasCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="h-40 rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden card-enter"
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
    >
      <div className="h-[calc(100%-3.75rem)] bg-gray-100 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 w-2/3 rounded bg-gray-100 animate-pulse" />
        <div className="h-2.5 w-1/3 rounded bg-gray-100 animate-pulse" />
      </div>
    </div>
  );
}
