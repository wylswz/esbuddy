import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User, Workspace } from '@esbuddy/sdk';

import { CanvasEditor } from './components/CanvasEditor';
import { HomePage } from './components/HomePage';
import { LoginPage } from './components/LoginPage';
import { getStore, isRemoteMode } from './stores';
import { clearAuthToken } from './auth';

const WORKSPACE_STORAGE_KEY = 'esbuddy.workspace';

function App() {
  const remote = isRemoteMode();
  const [auth, setAuth] = useState<'loading' | 'authed' | 'anon'>(() =>
    remote ? 'loading' : 'authed',
  );
  const store = useMemo(
    () =>
      getStore({
        onUnauthorized: () => {
          clearAuthToken();
          setAuth('anon');
        },
      }),
    [],
  );

  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(!remote);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(WORKSPACE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Both modes start on the gallery; opening a card enters the editor.
  const [openCanvasId, setOpenCanvasId] = useState<string | null>(null);

  // Resolve the auth state in remote mode (login page vs app).
  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    store
      .getCurrentUser()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setAuth(u ? 'authed' : 'anon');
      })
      .catch(() => {
        if (!cancelled) setAuth('anon');
      });
    return () => {
      cancelled = true;
    };
  }, [store, remote]);

  // Load the user's workspaces once authed; pick a sensible current one.
  useEffect(() => {
    if (!remote || auth !== 'authed') return;
    let cancelled = false;
    store
      .listWorkspaces()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(list);
        setCurrentWorkspaceId((prev) => {
          if (prev && list.some((w) => w.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]);
      })
      .finally(() => {
        if (!cancelled) setWorkspacesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store, remote, auth]);

  const selectWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id);
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const createWorkspace = useCallback(
    async (name: string) => {
      const ws = await store.createWorkspace(name);
      setWorkspaces((prev) => [...prev, ws]);
      selectWorkspace(ws.id);
    },
    [store, selectWorkspace],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setOpenCanvasId(null);
    setUser(null);
    setAuth('anon');
  }, []);

  if (auth === 'loading' || (remote && auth === 'authed' && !workspacesLoaded)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-page text-fg-subtle">
        Loading…
      </div>
    );
  }

  if (auth === 'anon') {
    return <LoginPage onLoggedIn={() => setAuth('authed')} />;
  }

  if (openCanvasId) {
    return (
      <CanvasEditor canvasId={openCanvasId} store={store} onBack={() => setOpenCanvasId(null)} />
    );
  }

  return (
    <HomePage
      store={store}
      remote={remote}
      user={user}
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      onSelectWorkspace={selectWorkspace}
      onCreateWorkspace={createWorkspace}
      onOpenCanvas={setOpenCanvasId}
      onLogout={logout}
    />
  );
}

export default App;
