import { HttpStore, type Store } from '@esbuddy/sdk';
import { LocalStore } from './LocalStore';

/**
 * Select the concrete Store implementation (ADR-0001.1):
 *  - default (`local`): localStorage, stateless GitHub Pages build
 *  - `remote`: REST client -> Hono backend (fullstack single deployment)
 */
export function isRemoteMode(): boolean {
  return (import.meta.env.VITE_STORE_MODE ?? 'local') === 'remote';
}

export interface GetStoreOptions {
  onUnauthorized?: () => void;
}

export function getStore(options: GetStoreOptions = {}): Store {
  if (isRemoteMode()) {
    const baseUrl = import.meta.env.VITE_API_URL ?? '/api';
    return new HttpStore({ baseUrl, onUnauthorized: options.onUnauthorized });
  }
  return new LocalStore();
}
