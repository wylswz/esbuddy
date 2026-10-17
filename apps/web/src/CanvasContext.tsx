import { createContext, useContext } from 'react';
import type { CanvasVote, Severity } from '@esbuddy/sdk';
import type { PeerUser } from './collab/awareness';

export interface CanvasActions {
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeDescription: (id: string, description: string) => void;
  /** Cast or take back this user's vote on a hot spot (absent where voting is off). */
  toggleVote?: (id: string) => void;
  /** This user's id, to tell their own votes apart. */
  voterId?: string;
  /** Viewing a published version: nodes must not enter edit mode. */
  readOnly?: boolean;
  selectionCount?: number;
  bringToFront?: () => void;
  sendToBack?: () => void;
  detachNode?: (id: string) => void;
  composing?: boolean;
}

export const CanvasActionsContext = createContext<CanvasActions>({
  updateNodeLabel: () => {},
  updateNodeDescription: () => {},
});

// Id of the node a drag would attach to on drop (or null): the aggregate an
// event/command would join, or the note an attacher would bind to.
export const DropTargetContext = createContext<string | null>(null);

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}

export function useDropTarget(): string | null {
  return useContext(DropTargetContext);
}

// nodeId -> peers who currently have that node selected (for remote highlights).
const NO_PEERS: PeerUser[] = [];
export const RemoteSelectionContext = createContext<ReadonlyMap<string, PeerUser[]>>(new Map());

export function useRemoteSelection(nodeId: string): PeerUser[] {
  return useContext(RemoteSelectionContext).get(nodeId) ?? NO_PEERS;
}

// nodeId -> votes cast on that hot spot.
const NO_VOTES: CanvasVote[] = [];
export const VotesContext = createContext<ReadonlyMap<string, CanvasVote[]>>(new Map());

export function useNodeVotes(nodeId: string): CanvasVote[] {
  return useContext(VotesContext).get(nodeId) ?? NO_VOTES;
}

// nodeId -> worst compiler diagnostic on that node, while the compile panel is open.
export const DiagnosticsContext = createContext<ReadonlyMap<string, Severity>>(new Map());

export function useNodeDiagnostic(nodeId: string): Severity | undefined {
  return useContext(DiagnosticsContext).get(nodeId);
}

/** Outline colour for a note carrying a diagnostic. */
export function diagnosticColor(severity: Severity | undefined): string | undefined {
  return severity === 'error' ? 'var(--color-danger)' : severity === 'warning' ? 'var(--color-warning)' : undefined;
}
