import type {
  CanvasMeta,
  CanvasOwner,
  CanvasRecord,
  CanvasSnapshot,
  CanvasVersion,
  CanvasVersionMeta,
  CreatedWorkspaceToken,
  CreateWorkspaceTokenInput,
  Invitation,
  InvitationPreview,
  PublishedCanvasVersion,
  Role,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceToken,
} from './domain.js';

export interface PublishVersionInput {
  description: string;
  /** Off by default: no permalink until public access is switched on. */
  isPublic: boolean;
  snapshot: CanvasSnapshot;
}

/** Only metadata is mutable; content stays frozen. */
export interface UpdateVersionInput {
  description?: string;
  isPublic?: boolean;
}

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
  deleteWorkspace(workspaceId: string): Promise<void>;
  createInvitation(workspaceId: string, role: Role): Promise<Invitation>;
  previewInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<Workspace>;
  // Workspace-scoped agent credentials (backend only, owner-managed).
  listWorkspaceTokens(workspaceId: string): Promise<WorkspaceToken[]>;
  createWorkspaceToken(workspaceId: string, input: CreateWorkspaceTokenInput): Promise<CreatedWorkspaceToken>;
  revokeWorkspaceToken(workspaceId: string, tokenId: string): Promise<void>;
  // canvases (metadata + read-only snapshot; content is edited through a
  // collaborative Y.Doc, see `ydoc.ts`, never written through the Store)
  listCanvases(scope?: { userId?: string; workspaceId?: string }): Promise<CanvasMeta[]>;
  getCanvas(id: string): Promise<CanvasRecord | null>;
  createCanvas(name: string, owner?: CanvasOwner): Promise<CanvasMeta>;
  renameCanvas(id: string, name: string): Promise<CanvasMeta>;
  deleteCanvas(id: string): Promise<void>;
  // published versions (backend modes only; LocalStore rejects)
  listVersions(canvasId: string): Promise<CanvasVersionMeta[]>;
  getVersion(canvasId: string, versionId: string): Promise<CanvasVersion>;
  publishVersion(canvasId: string, input: PublishVersionInput): Promise<CanvasVersionMeta>;
  updateVersion(canvasId: string, versionId: string, patch: UpdateVersionInput): Promise<CanvasVersionMeta>;
  deleteVersion(canvasId: string, versionId: string): Promise<void>;
  /** Public (no auth): resolve a permalink. Null if missing or not public. */
  getPublishedVersion(versionId: string): Promise<PublishedCanvasVersion | null>;
}
