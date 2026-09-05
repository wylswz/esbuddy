import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  CanvasSnapshot,
  Invitation,
  InvitationPreview,
  Store,
  User,
  Workspace,
  WorkspaceMember,
} from '@esbuddy/sdk';
import { deleteLocalCanvasDoc } from '../collab/provider';
import * as storage from '../storage';

const LOCAL_USER: User = {
  id: 'local-user',
  name: 'Local User',
  email: 'local@esbuddy.local',
  provider: 'local',
  createdAt: 0,
};

const LOCAL_NOT_SUPPORTED = 'Not available in local (stateless) mode';

function localOwner(): CanvasOwner {
  return { type: 'user', userId: LOCAL_USER.id };
}

function toMeta(id: string, name: string): CanvasMeta {
  return {
    id,
    name,
    owner: localOwner(),
    version: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Stateless storage backed by localStorage (ADR-0001.1).
 * Multi-canvas only; no real users or workspaces.
 */
export class LocalStore implements Store {
  constructor() {
    // Ensure the worked DDD example exists on first visit (idempotent).
    storage.ensureExampleSeed();
  }

  getCurrentUser(): Promise<User | null> {
    return Promise.resolve(LOCAL_USER);
  }

  listWorkspaces(): Promise<Workspace[]> {
    return Promise.resolve([]);
  }

  listMembers(): Promise<WorkspaceMember[]> {
    return Promise.resolve([]);
  }

  createWorkspace(): Promise<Workspace> {
    return Promise.reject(new Error(LOCAL_NOT_SUPPORTED));
  }

  deleteWorkspace(): Promise<void> {
    return Promise.reject(new Error(LOCAL_NOT_SUPPORTED));
  }

  createInvitation(): Promise<Invitation> {
    return Promise.reject(new Error(LOCAL_NOT_SUPPORTED));
  }

  previewInvitation(): Promise<InvitationPreview> {
    return Promise.resolve({ valid: false });
  }

  acceptInvitation(): Promise<Workspace> {
    return Promise.reject(new Error(LOCAL_NOT_SUPPORTED));
  }

  listCanvases(): Promise<CanvasMeta[]> {
    return Promise.resolve(storage.listCanvases().map((c) => toMeta(c.id, c.name)));
  }

  getCanvas(id: string): Promise<CanvasRecord | null> {
    const snapshot = storage.loadCanvas(id);
    if (!snapshot) return Promise.resolve(null);
    const meta = storage.listCanvases().find((c) => c.id === id);
    return Promise.resolve({
      ...toMeta(id, meta?.name ?? 'Untitled Canvas'),
      snapshot: snapshot as unknown as CanvasSnapshot,
    });
  }

  createCanvas(name: string): Promise<CanvasMeta> {
    const id = storage.createCanvas(name);
    return Promise.resolve(toMeta(id, name));
  }

  renameCanvas(id: string, name: string): Promise<CanvasMeta> {
    storage.renameCanvas(id, name);
    return Promise.resolve(toMeta(id, name));
  }

  deleteCanvas(id: string): Promise<void> {
    storage.deleteCanvas(id);
    // The canvas's CRDT document lives in IndexedDB (see collab/provider.ts).
    return deleteLocalCanvasDoc(id);
  }
}
