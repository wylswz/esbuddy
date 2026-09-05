import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, Users } from 'lucide-react';
import type { CanvasMeta, Store, User, Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { CanvasCard, CanvasCardSkeleton } from './CanvasCard';
import { Masthead, PageBar, PageShell } from './PageChrome';
import { ConfirmDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface HomePageProps {
  store: Store;
  remote: boolean;
  user: User | null;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => void;
  onOpenCanvas: (id: string) => void;
  onOpenWorkspaceSettings?: (() => void) | undefined;
  onLogout: () => void;
}

export function HomePage({
  store,
  remote,
  user,
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onOpenCanvas,
  onOpenWorkspaceSettings,
  onLogout,
}: HomePageProps) {
  const { t, locale, setLocale } = useI18n();
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // In remote mode the list is scoped to the selected workspace; local mode is global.
  const scope = remote && currentWorkspaceId ? { workspaceId: currentWorkspaceId } : undefined;
  const scopeKey = remote ? currentWorkspaceId : 'local';

  const refresh = useCallback(() => {
    let cancelled = false;
    if (remote && !currentWorkspaceId) {
      setCanvases([]);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    store
      .listCanvases(scope)
      .then((list) => {
        if (!cancelled) setCanvases([...list].sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .catch(() => {
        if (!cancelled) setCanvases([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  useEffect(() => refresh(), [refresh]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const owner =
        remote && currentWorkspaceId
          ? ({ type: 'workspace', workspaceId: currentWorkspaceId } as const)
          : undefined;
      const meta = await store.createCanvas(t('home.untitled'), owner);
      onOpenCanvas(meta.id);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, name: string) => {
    setCanvases((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    try {
      await store.renameCanvas(id, name);
    } catch {
      refresh();
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete;
    setPendingDelete(null);
    await store.deleteCanvas(id);
    setCanvases((prev) => prev.filter((c) => c.id !== id));
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  const title = remote ? currentWorkspace?.name ?? t('workspace.select') : t('home.canvases');
  const count = loading ? null : canvases.length;

  return (
    <PageShell>
      <PageBar
        left={
          remote && (
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentId={currentWorkspaceId}
              onSelect={onSelectWorkspace}
              onCreate={onCreateWorkspace}
            />
          )
        }
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="text-xs"
            >
              {t('toolbar.switchLanguage')}
            </Button>
            {remote && user && (
              <>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full ml-1" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-semibold ml-1">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={onLogout} title={t('home.logout')} aria-label={t('home.logout')}>
                  <LogOut size={16} />
                </Button>
              </>
            )}
          </>
        }
      />

      <Masthead
        eyebrow={
          <>
            {remote ? t('workspace.title') : t('home.canvases')}
            {count !== null && (
              <>
                <span className="mx-2 text-fg-subtle">·</span>
                <span className="tabular-nums">{count}</span>
              </>
            )}
          </>
        }
        title={title}
        actions={
          remote && onOpenWorkspaceSettings ? (
            <Button variant="secondary" size="sm" onClick={onOpenWorkspaceSettings}>
              <Users size={14} />
              {t('workspacePage.manage')}
            </Button>
          ) : undefined
        }
      />

      <main>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-label={t('home.loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <CanvasCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="group relative flex flex-col justify-between h-44 p-5 rounded-md bg-accent text-ink text-left hover:bg-accent-deep hover:text-paper active:translate-y-px transition-[background-color,color,transform] disabled:opacity-50 card-enter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Plus size={28} strokeWidth={2.25} />
              <span className="font-display text-2xl font-bold tracking-[-0.02em] leading-none">{t('home.newCanvas')}</span>
            </button>

            {canvases.map((c, i) => (
              <CanvasCard
                key={c.id}
                store={store}
                canvas={c}
                index={i + 1}
                onOpen={onOpenCanvas}
                onRename={handleRename}
                onDelete={(id) => setPendingDelete(id)}
              />
            ))}
          </div>
        )}

        {!loading && canvases.length === 0 && (
          <p className="text-sm text-fg-muted mt-6">{t('home.empty')}</p>
        )}
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('home.delete')}
        description={t('home.deleteConfirm')}
        confirmLabel={t('home.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
