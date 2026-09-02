import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, LogOut, Plus } from 'lucide-react';
import type { CanvasMeta, Store, User, Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { CanvasCard, CanvasCardSkeleton } from './CanvasCard';
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
  onLogout,
}: HomePageProps) {
  const { t } = useI18n();
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('home.deleteConfirm'))) return;
    await store.deleteCanvas(id);
    setCanvases((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <LayoutGrid size={20} className="text-gray-500" />
            <span>Esbuddy</span>
          </div>
          <div className="flex items-center gap-3">
            {remote && (
              <WorkspaceSwitcher
                workspaces={workspaces}
                currentId={currentWorkspaceId}
                onSelect={onSelectWorkspace}
                onCreate={onCreateWorkspace}
              />
            )}
            {remote && user && (
              <div className="flex items-center gap-2">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title={t('home.logout')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className="max-w-5xl mx-auto px-6 py-8"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <h1 className="text-lg font-semibold text-gray-800 mb-4">{t('home.canvases')}</h1>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label={t('home.loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <CanvasCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="group flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors disabled:opacity-50 card-enter"
            >
              <Plus size={24} />
              <span className="text-sm font-medium">{t('home.newCanvas')}</span>
            </button>

            {canvases.map((c, i) => (
              <CanvasCard
                key={c.id}
                store={store}
                canvas={c}
                index={i + 1}
                onOpen={onOpenCanvas}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!loading && canvases.length === 0 && (
          <p className="text-sm text-gray-400 mt-4">{t('home.empty')}</p>
        )}
      </main>
    </div>
  );
}
