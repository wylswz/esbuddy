import { useEffect, useState } from 'react';
import type { InvitationPreview, Store, Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';

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

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-page">
      <div className="w-[360px] rounded-xl bg-surface shadow-lg p-8 flex flex-col gap-5">
        {preview === null ? (
          <p className="text-sm text-fg-muted">{t('invite.loading')}</p>
        ) : !preview.valid ? (
          <>
            <div>
              <h1 className="text-xl font-semibold text-fg">{t('invite.invalidTitle')}</h1>
              <p className="text-sm text-fg-muted mt-1">{t('invite.invalidBody')}</p>
            </div>
            <button
              onClick={onDismiss}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-muted text-sm font-medium text-fg-secondary hover:bg-surface-strong transition-colors"
            >
              {t('invite.dismiss')}
            </button>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold text-fg">{t('invite.title')}</h1>
              <p className="text-sm text-fg-muted mt-1">
                {t('invite.body')
                  .replace('{workspace}', preview.workspaceName ?? '')
                  .replace('{role}', t(`invite.role.${preview.role ?? 'editor'}`))}
              </p>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onDismiss}
                disabled={joining}
                className="flex-1 px-4 py-2.5 rounded-lg bg-surface-muted text-sm font-medium text-fg-secondary hover:bg-surface-strong disabled:opacity-40 transition-colors"
              >
                {t('invite.decline')}
              </button>
              <button
                onClick={handleJoin}
                disabled={joining}
                className="flex-1 px-4 py-2.5 rounded-lg bg-inverse text-fg-inverse text-sm font-medium hover:bg-inverse-hover disabled:opacity-40 transition-colors"
              >
                {t('invite.join')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
