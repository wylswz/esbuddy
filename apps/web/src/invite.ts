/**
 * Pending workspace-share invite handling.
 *
 * A share link looks like `<app>/?invite=<token>`. The recipient may not be
 * signed in yet, and the Google OAuth round-trip drops the query string, so we
 * capture the token on boot, persist it, and strip it from the URL. Once the
 * user is authenticated the app reads the pending invite and shows the
 * confirmation screen.
 */
const INVITE_STORAGE_KEY = 'esbuddy.invite';

/**
 * Read an `?invite=...` param (from a share link), persist it so it survives the
 * SSO redirect, and strip it from the URL so it isn't replayed on refresh.
 */
export function captureInviteToken(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) {
      localStorage.setItem(INVITE_STORAGE_KEY, token);
      params.delete('invite');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    return token ?? localStorage.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
