import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  Invitation,
  InvitationPreview,
  Role,
  User,
  Workspace,
  WorkspaceMember,
} from './domain.js';

/**
 * Storage abstraction (ADR-0001.1). The app depends only on this interface;
 * a concrete implementation is selected at build/runtime:
 *  - LocalStore  (localStorage, stateless GitHub Pages build)
 *  - HttpStore   (REST -> backend, fullstack single deployment)
 */
export interface Store {
  // auth
  getCurrentUser(): Promise<User | null>;
  // workspaces
  listWorkspaces(): Promise<Workspace[]>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  createWorkspace(name: string): Promise<Workspace>;
  createInvitation(workspaceId: string, role: Role): Promise<Invitation>;
  previewInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<Workspace>;
  // canvases (metadata + read-only snapshot; content is edited through a
  // collaborative Y.Doc, see `ydoc.ts`, never written through the Store)
  listCanvases(scope?: { userId?: string; workspaceId?: string }): Promise<CanvasMeta[]>;
  getCanvas(id: string): Promise<CanvasRecord | null>;
  createCanvas(name: string, owner?: CanvasOwner): Promise<CanvasMeta>;
  renameCanvas(id: string, name: string): Promise<CanvasMeta>;
  deleteCanvas(id: string): Promise<void>;
}
