import type { UndoManager } from 'yjs';

/** Keep a pointer gesture atomic even if the user pauses before dropping. */
export function gestureHistory(manager: UndoManager) {
  let timeout: number | null = null;
  return {
    begin() {
      if (timeout !== null) return;
      timeout = manager.captureTimeout;
      manager.captureTimeout = Infinity;
    },
    end() {
      if (timeout === null) return;
      manager.captureTimeout = timeout;
      timeout = null;
    },
  };
}
