import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function WorkspaceSwitcher({ workspaces, currentId, onSelect, onCreate }: WorkspaceSwitcherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current = workspaces.find((w) => w.id === currentId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const submitCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface shadow-sm hover:bg-surface-hover transition-colors text-sm font-medium text-fg-secondary"
      >
        <span className="max-w-45 truncate">
          {current?.name ?? t('workspace.select')}
        </span>
        <ChevronDown size={16} className="text-fg-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface shadow-lg border border-border-subtle py-1.5 z-30">
          <div className="px-3 pb-1 pt-0.5 text-xs font-semibold text-fg-subtle uppercase tracking-wide">
            {t('workspace.title')}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  onSelect(w.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg-secondary hover:bg-surface-hover transition-colors"
              >
                <span className="flex-1 truncate text-left">{w.name}</span>
                {w.id === currentId && <Check size={16} className="text-fg" />}
              </button>
            ))}
          </div>

          <div className="h-px bg-border-subtle my-1" />

          {creating ? (
            <div className="flex gap-1.5 px-3 py-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder={t('workspace.namePlaceholder')}
                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-border text-sm text-fg-secondary outline-none focus:border-border-strong"
              />
              <button
                onClick={submitCreate}
                className="px-2.5 py-1 rounded-md bg-inverse text-fg-inverse text-xs font-medium hover:bg-inverse-hover transition-colors"
              >
                {t('workspace.create')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:bg-surface-hover transition-colors"
            >
              <Plus size={16} />
              <span>{t('workspace.new')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
