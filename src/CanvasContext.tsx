import { createContext, useContext } from 'react';

export interface CanvasActions {
  updateNodeLabel: (id: string, label: string) => void;
}

export const CanvasActionsContext = createContext<CanvasActions>({
  updateNodeLabel: () => {},
});

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}
