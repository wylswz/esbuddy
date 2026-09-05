import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, Trash2 } from 'lucide-react';
import type { Role, Store, User, Workspace, WorkspaceMember } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { Masthead, PageBar, PageShell, SectionLabel } from './PageChrome';
import { ConfirmDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface WorkspacePageProps {
  store: Store;
  workspace: Workspace;
  user: User | null;
  onBack: () => void;
  onDeleted: (workspaceId: string) => void;
}

/** Build a share link for the current deployment (SPA `?invite=` flow). */
function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

/**
 * Workspace management page: members and share-link invitations. Scoped for
 * future growth (member roles, user management, removal, …).
 */
export function WorkspacePage({ store, workspace, user, onBack, onDeleted }: WorkspacePageProps) {
  const { t } = useI18n();
  const isOwner = !!user && user.id === workspace.ownerId;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [role, setRole] = useState<Role>('editor');
  const [link, setLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleDelete = useCallback(async () => {
    setDeleteError(null);
    try {
      await store.deleteWorkspace(workspace.id);
      onDeleted(workspace.id);
    } catch (err) {
      setDeleteError(String(err));
    }
  }, [store, workspace.id, onDeleted]);

  const roleOptions = [
    { value: 'editor', label: t('invite.role.editor') },
    { value: 'viewer', label: t('invite.role.viewer') },
  ] as const;

  return (
    <PageShell width="narrow">
      <PageBar
        left={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} />
            {t('workspacePage.back')}
          </Button>
        }
      />

      <Masthead eyebrow={t('workspacePage.manage')} title={workspace.name} />

      <main className="flex flex-col gap-12">
        {isOwner && (
          <section className="rounded-md bg-accent text-ink p-6 sm:p-8 flex flex-col gap-6">
            <div>
              <SectionLabel className="text-ink-soft">{t('workspacePage.inviteTitle')}</SectionLabel>
              <p className="mt-2 max-w-md text-sm sm:text-base leading-snug text-ink-soft">{t('workspacePage.inviteHint')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select<Role>
                value={role}
                onValueChange={setRole}
                options={roleOptions}
                className="w-36 border-ink/30 bg-paper"
              />
              <Button onClick={handleGenerate} disabled={generating}>
                <Link2 size={16} />
                {t('workspacePage.generateLink')}
              </Button>
            </div>

            {error && <p className="text-xs text-hotspot font-medium">{error}</p>}

            {link && (
              <div className="flex items-center gap-2 poster-enter">
                <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="border-ink/30 font-mono text-xs" />
                <Button variant="secondary" onClick={handleCopy} className="shrink-0 min-w-28">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? t('workspacePage.copied') : t('workspacePage.copy')}
                </Button>
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <SectionLabel>{t('workspacePage.membersTitle')}</SectionLabel>
            <span className="text-xs tabular-nums text-fg-subtle">{members.length}</span>
          </div>
          <ul className="divide-y divide-ink-faint border-y border-ink-faint">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-semibold shrink-0">
                    {m.userId.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate text-ink">{m.userId}</span>
                  {user && m.userId === user.id && (
                    <span className="text-xs text-fg-subtle shrink-0">{t('workspacePage.you')}</span>
                  )}
                </span>
                <span
                  className={
                    m.role === 'owner'
                      ? 'text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-sm bg-ink text-paper'
                      : 'text-[11px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-sm border border-ink/20 text-fg-muted'
                  }
                >
                  {t(`invite.role.${m.role}`)}
                </span>
              </li>
            ))}
            {members.length === 0 && <li className="py-3.5 text-sm text-fg-subtle">{t('workspacePage.noMembers')}</li>}
          </ul>
        </section>

        {isOwner && (
          <section className="flex flex-col gap-4">
            <div>
              <SectionLabel className="text-hotspot">{t('workspacePage.deleteTitle')}</SectionLabel>
              <p className="mt-2 max-w-md text-sm leading-snug text-fg-muted">{t('workspacePage.deleteHint')}</p>
            </div>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="self-start text-hotspot border border-hotspot/30 hover:bg-hotspot/5">
              <Trash2 size={16} />
              {t('workspacePage.delete')}
            </Button>
            {deleteError && <p className="text-xs text-hotspot font-medium">{deleteError}</p>}
          </section>
        )}
      </main>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setDeleteError(null);
        }}
        title={t('workspacePage.delete')}
        description={t('workspacePage.deleteConfirm')}
        confirmLabel={t('workspacePage.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
