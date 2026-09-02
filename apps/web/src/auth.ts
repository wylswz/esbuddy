import { TOKEN_STORAGE_KEY } from '@esbuddy/sdk';

/**
 * Read a `?token=...` param (set by the OAuth callback redirect), persist it,
 * and strip it from the URL so it isn't replayed on refresh.
 */
export function captureAuthToken(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      params.delete('token');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    return token ?? localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Dev-only login: mints a token for a local user (no Google required). */
export async function devLogin(email?: string): Promise<void> {
  const res = await globalThis.fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/** Whether the backend has dev mode enabled (controls showing the dev-login UI). */
export async function fetchDevMode(): Promise<boolean> {
  try {
    const res = await globalThis.fetch('/api/config');
    if (!res.ok) return false;
    const { devMode } = (await res.json()) as { devMode?: boolean };
    return !!devMode;
  } catch {
    return false;
  }
}
