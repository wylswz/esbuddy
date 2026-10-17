import { useEffect, useState } from 'react';
import { Bot, Check, Copy, KeyRound } from 'lucide-react';
import type { CreatedWorkspaceToken, Store, WorkspaceToken, WorkspaceTokenRole } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { SectionLabel } from './PageChrome';
import { ConfirmDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { McpConnectionGuide } from './McpConnectionGuide.js';

export function WorkspaceTokens({ store, workspaceId }: { store: Store; workspaceId: string }) {
  const { t, locale } = useI18n();
  const [tokens, setTokens] = useState<WorkspaceToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [role, setRole] = useState<WorkspaceTokenRole>('editor');
  const [days, setDays] = useState('90');
  const [created, setCreated] = useState<CreatedWorkspaceToken | null>(null);
  const secret = created?.token ?? null;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<WorkspaceToken | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    store.listWorkspaceTokens(workspaceId)
      .then((list) => { if (!cancelled) setTokens(list); })
      .catch((err: unknown) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [store, workspaceId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const create = async () => {
    if (creating || loading || !name.trim()) return;
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      const { token, ...metadata } = await store.createWorkspaceToken(workspaceId, {
        name: name.trim(), role, expiresAt: Date.now() + Number(days) * 86_400_000,
      });
      setTokens((list) => [metadata, ...list]);
      setCreated({ ...metadata, token });
      setName('');
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // The readonly field remains selectable if clipboard access is unavailable.
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setError(null);
    try {
      await store.revokeWorkspaceToken(workspaceId, revoking.id);
      setTokens((list) => list.map((item) => item.id === revoking.id ? { ...item, revokedAt: Date.now() } : item));
      if (created?.id === revoking.id) setCreated(null);
      setRevoking(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(locale);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <SectionLabel>{t('tokens.title')}</SectionLabel>
        <p className="mt-2 max-w-lg text-sm leading-snug text-fg-muted">{t('tokens.hint')}</p>
      </div>

      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted sm:col-span-2">
          {t('tokens.name')}
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required
            placeholder={t('tokens.namePlaceholder')} autoComplete="off" disabled={creating} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          {t('tokens.role')}
          <Select<WorkspaceTokenRole> value={role} onValueChange={setRole} aria-label={t('tokens.role')} options={[
            { value: 'editor', label: t('invite.role.editor') },
            { value: 'viewer', label: t('invite.role.viewer') },
          ]} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          {t('tokens.expiry')}
          <Select value={days} onValueChange={setDays} aria-label={t('tokens.expiry')} options={
            ['7', '30', '90', '365'].map((value) => ({ value, label: t('tokens.days', { days: value }) }))
          } />
        </label>
        <Button type="submit" className="justify-self-start sm:col-span-2" disabled={loading || creating || !name.trim()}>
          <KeyRound size={15} />
          {creating ? t('tokens.creating') : t('tokens.create')}
        </Button>
      </form>

      {secret && (
        <div className="rounded-md border border-ink/20 bg-surface-muted p-4 flex flex-col gap-3 poster-enter">
          <p className="text-sm font-medium">{t('tokens.once')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input readOnly value={secret} aria-label={t('tokens.secret')} autoComplete="off"
              onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => void copy()} className="shrink-0">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t('workspacePage.copied') : t('workspacePage.copy')}
            </Button>
          </div>
          <McpConnectionGuide key={created!.id} token={secret} identityName={created!.identity.name} />
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setCreated(null)}>
            {t('tokens.saved')}
          </Button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-hotspot">{error}</p>}
      <ul className="divide-y divide-ink-faint border-y border-ink-faint">
        {tokens.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-7 w-7 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: token.identity.color }}><Bot size={16} /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{token.identity.name}</p>
                <p className="text-xs text-fg-subtle">
                  <span className="font-mono">{token.prefix}...</span>
                  {' / '}{t(`invite.role.${token.role}`)}
                  {' / '}{token.revokedAt ? t('tokens.revoked')
                    : token.expiresAt <= now ? t('tokens.expired')
                    : t('tokens.expires', { date: date(token.expiresAt) })}
                </p>
              </div>
            </div>
            {!token.revokedAt && (
              <Button variant="ghost" size="sm" className="text-hotspot" onClick={() => setRevoking(token)}>
                {t('tokens.revoke')}
              </Button>
            )}
          </li>
        ))}
        {tokens.length === 0 && (
          <li className="py-3.5 text-sm text-fg-subtle">{loading ? t('home.loading') : t('tokens.empty')}</li>
        )}
      </ul>

      <ConfirmDialog open={!!revoking} onOpenChange={(open) => { if (!open) setRevoking(null); }}
        title={t('tokens.revoke')} description={t('tokens.revokeConfirm', { name: revoking?.identity.name ?? '' })}
        confirmLabel={t('tokens.revoke')} cancelLabel={t('common.cancel')} destructive onConfirm={revoke} />
    </section>
  );
}
