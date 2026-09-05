import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User, Workspace } from '@esbuddy/sdk';

import { CanvasEditor } from './components/CanvasEditor';
import { HomePage } from './components/HomePage';
import { InviteAcceptPage } from './components/InviteAcceptPage';
import { LoginPage } from './components/LoginPage';
import { WorkspacePage } from './components/WorkspacePage';
import { getStore, isRemoteMode } from './stores';
import { clearAuthToken } from './auth';
import { clearPendingInvite, getPendingInvite } from './invite';

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
  // Workspace management page (share links, members).
  const [showWorkspacePage, setShowWorkspacePage] = useState(false);
  // Pending share invite captured from a `?invite=` link (survives SSO).
  const [pendingInvite, setPendingInvite] = useState<string | null>(() =>
    remote ? getPendingInvite() : null,
  );

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

  const handleInviteJoined = useCallback(
    (ws: Workspace) => {
      clearPendingInvite();
      setPendingInvite(null);
      setWorkspaces((prev) => (prev.some((w) => w.id === ws.id) ? prev : [...prev, ws]));
      selectWorkspace(ws.id);
    },
    [selectWorkspace],
  );

  const dismissInvite = useCallback(() => {
    clearPendingInvite();
    setPendingInvite(null);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setOpenCanvasId(null);
    setShowWorkspacePage(false);
    setUser(null);
    setAuth('anon');
  }, []);

  if (auth === 'loading' || (remote && auth === 'authed' && !workspacesLoaded)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-paper">
        <span className="h-1 w-24 bg-accent animate-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (auth === 'anon') {
    return <LoginPage onLoggedIn={() => setAuth('authed')} />;
  }

  // A share link was opened: confirm and join before showing the app.
  if (remote && pendingInvite) {
    return (
      <InviteAcceptPage
        store={store}
        token={pendingInvite}
        onJoined={handleInviteJoined}
        onDismiss={dismissInvite}
      />
    );
  }

  if (openCanvasId) {
    return (
      <CanvasEditor canvasId={openCanvasId} store={store} onBack={() => setOpenCanvasId(null)} />
    );
  }

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  if (remote && showWorkspacePage && currentWorkspace) {
    return (
      <WorkspacePage
        store={store}
        workspace={currentWorkspace}
        user={user}
        onBack={() => setShowWorkspacePage(false)}
      />
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
      onOpenWorkspaceSettings={currentWorkspace ? () => setShowWorkspacePage(true) : undefined}
      onLogout={logout}
    />
  );
}

export default App;
