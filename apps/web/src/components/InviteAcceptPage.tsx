import { useEffect, useState } from 'react';
import type { InvitationPreview, Store, Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { AuthShell } from './AuthShell';

interface InviteAcceptPageProps {
  store: Store;
  token: string;
  onJoined: (workspace: Workspace) => void;
  onDismiss: () => void;
}

/**
 * Confirmation screen shown after the recipient signs in via a share link.
 * Previews the target workspace, then verifies + accepts the share code.
 */
export function InviteAcceptPage({ store, token, onJoined, onDismiss }: InviteAcceptPageProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    store
      .previewInvitation(token)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview({ valid: false });
      });
    return () => {
      cancelled = true;
    };
  }, [store, token]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const workspace = await store.acceptInvitation(token);
      onJoined(workspace);
    } catch (err) {
      setError(String(err));
      setJoining(false);
    }
  };

  const heading = 'font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-ink';
  const primary =
    'flex-1 px-5 py-3.5 rounded-md bg-ink text-paper text-sm font-semibold hover:bg-inverse-hover disabled:opacity-40 transition-colors';
  const secondary =
    'flex-1 px-5 py-3.5 rounded-md border border-ink text-sm font-semibold text-ink hover:bg-ink hover:text-paper disabled:opacity-40 transition-colors';

  return (
    <AuthShell>
      <div className="flex flex-col gap-8">
        {preview === null ? (
          <p className="text-sm text-fg-muted">{t('invite.loading')}</p>
        ) : !preview.valid ? (
          <>
            <div>
              <h2 className={heading}>{t('invite.invalidTitle')}</h2>
              <p className="text-sm sm:text-base text-fg-muted mt-3 leading-snug">{t('invite.invalidBody')}</p>
            </div>
            <button onClick={onDismiss} className={secondary}>
              {t('invite.dismiss')}
            </button>
          </>
        ) : (
          <>
            <div>
              <h2 className={heading}>{t('invite.title')}</h2>
              <p className="text-sm sm:text-base text-fg-muted mt-3 leading-snug">
                {t('invite.body')
                  .replace('{workspace}', preview.workspaceName ?? '')
                  .replace('{role}', t(`invite.role.${preview.role ?? 'editor'}`))}
              </p>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onDismiss} disabled={joining} className={secondary}>
                {t('invite.decline')}
              </button>
              <button onClick={handleJoin} disabled={joining} className={primary}>
                {t('invite.join')}
              </button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
