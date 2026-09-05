import { HttpStore, type Store } from '@esbuddy/sdk';
import { LocalStore } from './LocalStore';
import { isRemoteMode } from './mode';

export { isRemoteMode } from './mode';

/**
 * Select the concrete Store implementation (ADR-0001.1):
 *  - default (`local`): localStorage, stateless GitHub Pages build
 *  - `remote`: REST client -> Hono backend (fullstack single deployment)
 */
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
