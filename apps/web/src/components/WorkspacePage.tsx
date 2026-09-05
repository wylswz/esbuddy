import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Link2 } from 'lucide-react';
import type { Role, Store, User, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';

interface WorkspacePageProps {
  store: Store;
  workspace: Workspace;
  user: User | null;
  onBack: () => void;
}

/** Build a share link for the current deployment (SPA `?invite=` flow). */
function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

/**
 * Workspace management page: members and share-link invitations. Scoped for
 * future growth (member roles, user management, removal, …).
 */
export function WorkspacePage({ store, workspace, user, onBack }: WorkspacePageProps) {
  const { t } = useI18n();
  const isOwner = !!user && user.id === workspace.ownerId;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [role, setRole] = useState<Role>('editor');
  const [link, setLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    store
      .listMembers(workspace.id)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [store, workspace.id]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const invite = await store.createInvitation(workspace.id, role);
      setLink(inviteLink(invite.token));
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }, [store, workspace.id, role]);

  const handleCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore; the input is selectable as a fallback
    }
  }, [link]);

  return (
    <div className="w-full h-full overflow-y-auto bg-page">
      <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted transition-colors"
            title={t('workspacePage.back')}
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-semibold text-fg truncate">{workspace.name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-10">
        {isOwner && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-fg">{t('workspacePage.inviteTitle')}</h2>
            <p className="text-sm text-fg-muted">{t('workspacePage.inviteHint')}</p>

            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="px-3 py-2 rounded-lg border border-border text-sm text-fg-secondary bg-surface outline-none focus:border-border-strong"
              >
                <option value="editor">{t('invite.role.editor')}</option>
                <option value="viewer">{t('invite.role.viewer')}</option>
              </select>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-inverse text-fg-inverse text-sm font-medium hover:bg-inverse-hover disabled:opacity-40 transition-colors"
              >
                <Link2 size={16} />
                {t('workspacePage.generateLink')}
              </button>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            {link && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border text-sm text-fg-secondary bg-surface-muted outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-muted text-sm font-medium text-fg-secondary hover:bg-surface-strong transition-colors"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? t('workspacePage.copied') : t('workspacePage.copy')}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-fg">{t('workspacePage.membersTitle')}</h2>
          <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-fg-secondary truncate">
                  {m.userId}
                  {user && m.userId === user.id && (
                    <span className="ml-2 text-xs text-fg-subtle">{t('workspacePage.you')}</span>
                  )}
                </span>
                <span className="text-xs font-medium text-fg-subtle uppercase tracking-wide">
                  {t(`invite.role.${m.role}`)}
                </span>
              </div>
            ))}
            {members.length === 0 && (
              <div className="px-4 py-3 text-sm text-fg-subtle">{t('workspacePage.noMembers')}</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
