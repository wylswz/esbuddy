import { HttpStore, type Store } from '@esbuddy/sdk';
import { LocalStore } from './LocalStore';

/**
 * Select the concrete Store implementation (ADR-0001.1):
 *  - default (`local`): localStorage, stateless GitHub Pages build
 *  - `remote`: REST client -> Hono backend (fullstack single deployment)
 */
export function getStore(): Store {
  const mode = import.meta.env.VITE_STORE_MODE ?? 'local';
  if (mode === 'remote') {
    const baseUrl = import.meta.env.VITE_API_URL ?? '/api';
    return new HttpStore({ baseUrl });
  }
  return new LocalStore();
}
