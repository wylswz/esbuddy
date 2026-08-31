export type ElementType =
  | 'event'
  | 'command'
  | 'aggregate'
  | 'actor'
  | 'policy'
  | 'external'
  | 'hotspot'
  | 'readmodel';

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

export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport | null;
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
