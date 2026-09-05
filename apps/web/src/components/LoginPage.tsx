import { useEffect, useState } from 'react';
import { devLogin, fetchDevMode } from '../auth';
import { useI18n } from '../i18n/context';
import { AuthShell } from './AuthShell';

interface LoginPageProps {
  onLoggedIn: () => void;
  /**
   * Pure-frontend (local) mode: there is no backend and no account. Instead of
   * the Google/dev sign-in, show a single "get started" button that drops the
   * visitor straight into the workspace.
   */
  local?: boolean;
  onStart?: () => void;
}

export function LoginPage({ onLoggedIn, local = false, onStart }: LoginPageProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    if (local) return;
    fetchDevMode().then(setDevMode);
  }, [local]);

  const handleGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const handleDevLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await devLogin(email || undefined);
      onLoggedIn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (local) {
    return (
      <AuthShell>
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-ink">
              {t('login.localTitle')}
            </h2>
            <p className="text-sm sm:text-base text-fg-muted mt-3 leading-snug">
              {t('login.localSubtitle')}
            </p>
          </div>

          <button
            onClick={onStart}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-md bg-ink text-paper text-sm font-semibold hover:bg-inverse-hover active:translate-y-px transition-[background-color,transform]"
          >
            {t('login.start')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-ink">
            {t('login.title')}
          </h2>
          <p className="text-sm sm:text-base text-fg-muted mt-3 leading-snug">{t('login.subtitle')}</p>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-md bg-ink text-paper text-sm font-semibold hover:bg-inverse-hover active:translate-y-px transition-[background-color,transform]"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.4 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.4 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.7 39.7 16.3 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.3 5.3C41.4 35.6 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z" />
          </svg>
          {t('login.google')}
        </button>

        {devMode && (
          <div className="flex flex-col gap-3 border-t border-ink-faint pt-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
              {t('login.devTitle')}
            </span>

            <div className="flex gap-2">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.devEmailPlaceholder')}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-surface border border-border text-sm text-fg outline-none focus:border-ink transition-colors"
              />
              <button
                onClick={handleDevLogin}
                disabled={busy}
                className="px-4 py-2.5 rounded-md border border-ink text-sm font-semibold text-ink hover:bg-ink hover:text-paper disabled:opacity-40 transition-colors"
              >
                {t('login.devLogin')}
              </button>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}
      </div>
    </AuthShell>
  );
}
