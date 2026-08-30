import { createContext, useContext } from 'react';

export interface CanvasActions {
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeDescription: (id: string, description: string) => void;
}

export const CanvasActionsContext = createContext<CanvasActions>({
  updateNodeLabel: () => {},
  updateNodeDescription: () => {},
});

// Id of the aggregate currently being hovered as a drop target (or null).
export const DropTargetContext = createContext<string | null>(null);

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}

export function useDropTarget(): string | null {
  return useContext(DropTargetContext);
}
