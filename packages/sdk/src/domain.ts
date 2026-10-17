export type ElementType =
  | 'event'
  | 'command'
  | 'aggregate'
  | 'actor'
  | 'policy'
  | 'external'
  | 'hotspot'
  | 'readmodel'
  /** A plain note for comments; not part of Event Storming, ignored by the compiler. */
  | 'note'
  /** A strip of tape stuck onto an event to mark it as pivotal. */
  | 'pivotal';

export type Role = 'owner' | 'editor' | 'viewer';

/** Canvas ownership: belongs to a single user, or to a workspace. */
export type CanvasOwner =
  | { type: 'user'; userId: string }
  | { type: 'workspace'; workspaceId: string };

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  provider: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: number;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  role: Role;
  token: string;
  createdById: string;
  createdAt: number;
  revokedAt?: number | null;
}

/**
 * Public, unauthenticated-safe view of an invitation used to render the
 * "join this workspace?" confirmation before the invite is accepted. Never
 * exposes the raw token or membership.
 */
export interface InvitationPreview {
  valid: boolean;
  workspaceId?: string;
  workspaceName?: string;
  role?: Role;
}

export interface CanvasMeta {
  id: string;
  name: string;
  owner: CanvasOwner;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** A horizontal band across the whole board, given to one role. Visual only. */
export interface CanvasLane {
  id: string;
  label: string;
  y: number;
  height: number;
}

/** A temporal milestone: a vertical line across the whole board marking a point in time. Visual only. */
export interface CanvasMilestone {
  id: string;
  label: string;
  x: number;
}

/** Board-level structure (swimlanes, temporal milestones): not notes, never compiled. */
export interface CanvasStructure {
  lanes: CanvasLane[];
  milestones: CanvasMilestone[];
}

export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport | null;
  /** Absent on snapshots without any structure (and on legacy ones). */
  structure?: CanvasStructure;
}

/** Append-only canvas event, the unit of future realtime sync (ADR-0001.7). */
export interface CanvasEvent {
  canvasId: string;
  seq: number;
  type: string;
  payload: unknown;
  actorId: string;
  createdAt: number;
}

export interface CanvasRecord extends CanvasMeta {
  snapshot: CanvasSnapshot;
}

/**
 * A published, immutable snapshot of a canvas. `id` is a random hex signature
 * (like a commit id) and is also the token in the version's permalink.
 */
export interface CanvasVersionMeta {
  id: string;
  canvasId: string;
  /** Canvas name at the time of publishing. */
  canvasName: string;
  description: string;
  /** Public access switch: the permalink only resolves while this is on. */
  isPublic: boolean;
  createdById: string;
  createdAt: number;
}

/** Full version (with content) for authenticated callers, e.g. restore. */
export interface CanvasVersion extends CanvasVersionMeta {
  snapshot: CanvasSnapshot;
}

/**
 * Public, unauthenticated view of a version served at its permalink. Omits the
 * canvas id and author so the link never exposes a handle to the live canvas.
 */
export interface PublishedCanvasVersion {
  id: string;
  canvasName: string;
  description: string;
  createdAt: number;
  snapshot: CanvasSnapshot;
}
