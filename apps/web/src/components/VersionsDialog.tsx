import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { CanvasSnapshot, CanvasVersionMeta, Store } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { shortSig, versionPermalink } from '../versions';
import { SectionLabel } from './PageChrome';
import { ConfirmDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { Dialog, DialogContent } from './ui/Dialog';
import { Switch } from './ui/Switch';

const MAX_DESCRIPTION = 2000;

const textarea =
  'w-full min-w-0 px-3 py-2 rounded-md bg-surface border border-border text-sm text-ink placeholder:text-fg-subtle outline-none transition-colors focus:border-ink resize-y';

interface VersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store;
  canvasId: string;
  /** Current board content, read at the moment Publish is clicked. */
  getSnapshot: () => CanvasSnapshot;
  /** Replace the live board with a published snapshot. */
  onRestore: (snapshot: CanvasSnapshot) => void;
}

type Pending = { kind: 'restore' | 'delete'; version: CanvasVersionMeta };

/** Publish the board as a new version and manage the canvas's version history. */
export function VersionsDialog({ open, onOpenChange, store, canvasId, getSnapshot, onRestore }: VersionsDialogProps) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<CanvasVersionMeta[] | null>(null);
  const [description, setDescription] = useState('');
  // Off by default: a version gets no permalink until public access is on.
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [justPublished, setJustPublished] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    store
      .listVersions(canvasId)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, store, canvasId]);

  // Run a store call with shared busy/error handling.
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const publish = () =>
    run(async () => {
      const v = await store.publishVersion(canvasId, { description, isPublic, snapshot: getSnapshot() });
      setVersions((prev) => [v, ...(prev ?? [])]);
      setDescription('');
      setIsPublic(false);
      setJustPublished(v.id);
    });

  const replaceVersion = (v: CanvasVersionMeta) =>
    setVersions((prev) => prev?.map((x) => (x.id === v.id ? v : x)) ?? null);

  const saveDescription = () => {
    if (!editing) return;
    const { id, draft } = editing;
    return run(async () => {
      replaceVersion(await store.updateVersion(canvasId, id, { description: draft }));
      setEditing(null);
    });
  };

  const setPublic = (id: string, next: boolean) =>
    run(async () => replaceVersion(await store.updateVersion(canvasId, id, { isPublic: next })));

  const confirmPending = (p: Pending) =>
    run(async () => {
      if (p.kind === 'delete') {
        await store.deleteVersion(canvasId, p.version.id);
        setVersions((prev) => prev?.filter((x) => x.id !== p.version.id) ?? null);
        return;
      }
      // Authenticated read: private versions have no public permalink.
      const version = await store.getVersion(canvasId, p.version.id);
      onRestore(version.snapshot);
      onOpenChange(false);
    });

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(versionPermalink(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // ignore; the Open link is still available
    }
  };

  const formatDate = (ms: number) => new Date(ms).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFailed(false);
          setEditing(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent title={t('versions.title')} description={t('versions.hint')}>
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('versions.descriptionPlaceholder')}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              className={textarea}
            />
            <label htmlFor="version-public" className="flex items-center gap-3 cursor-pointer select-none">
              <Switch id="version-public" checked={isPublic} onCheckedChange={setIsPublic} />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{t('versions.publicAccess')}</span>
                <span className="text-xs text-fg-muted">{t('versions.publicAccessHint')}</span>
              </span>
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-hotspot font-medium">{failed ? t('versions.error') : ''}</span>
              <Button variant="accent" onClick={publish} disabled={busy}>
                <Upload size={16} />
                {busy ? t('versions.publishing') : t('versions.publish')}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>{t('versions.history')}</SectionLabel>
              <span className="text-xs tabular-nums text-fg-subtle">{versions?.length ?? ''}</span>
            </div>
            <ul className="divide-y divide-ink-faint border-y border-ink-faint">
              {versions?.map((v) => (
                <li key={v.id} className={`flex flex-col gap-2 py-3.5 ${v.id === justPublished ? 'poster-enter' : ''}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <code
                      className={`font-mono text-xs px-1.5 py-0.5 rounded-sm ${
                        v.id === justPublished ? 'bg-accent text-ink' : 'bg-ink text-paper'
                      }`}
                      title={v.id}
                    >
                      {shortSig(v.id)}
                    </code>
                    <span className="text-xs tabular-nums text-fg-subtle">{formatDate(v.createdAt)}</span>
                    <label
                      className="flex items-center gap-1.5 cursor-pointer select-none"
                      title={v.isPublic ? t('versions.publicAccessHint') : t('versions.privateHint')}
                    >
                      <Switch
                        checked={v.isPublic}
                        onCheckedChange={(next) => setPublic(v.id, next)}
                        disabled={busy}
                        aria-label={t('versions.publicAccess')}
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                        {v.isPublic ? t('versions.public') : t('versions.private')}
                      </span>
                    </label>
                    <div className="ml-auto flex items-center gap-0.5">
                      {v.isPublic && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => copyLink(v.id)} title={t('versions.copyLink')}>
                            {copiedId === v.id ? <Check size={15} /> : <Copy size={15} />}
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={versionPermalink(v.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t('versions.open')}
                            >
                              <ExternalLink size={15} />
                            </a>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing({ id: v.id, draft: v.description })}
                        title={t('versions.edit')}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPending({ kind: 'restore', version: v })}
                        disabled={busy}
                        title={t('versions.restore')}
                      >
                        <RotateCcw size={15} />
                      </Button>
                      <Button
                        variant="danger"
                        size="icon"
                        onClick={() => setPending({ kind: 'delete', version: v })}
                        disabled={busy}
                        title={t('versions.delete')}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                  {editing?.id === v.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        autoFocus
                        value={editing.draft}
                        onChange={(e) => setEditing({ id: v.id, draft: e.target.value })}
                        maxLength={MAX_DESCRIPTION}
                        rows={3}
                        className={textarea}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                          {t('common.cancel')}
                        </Button>
                        <Button size="sm" onClick={saveDescription} disabled={busy}>
                          {t('versions.save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-ink whitespace-pre-wrap wrap-break-word">
                      {v.description || <span className="text-fg-subtle">{t('versions.noDescription')}</span>}
                    </p>
                  )}
                </li>
              ))}
              {versions?.length === 0 && <li className="py-3.5 text-sm text-fg-subtle">{t('versions.empty')}</li>}
            </ul>
          </section>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === 'delete' ? t('versions.deleteTitle') : t('versions.restoreTitle')}
        description={
          pending &&
          t(pending.kind === 'delete' ? 'versions.deleteConfirm' : 'versions.restoreConfirm', {
            sig: shortSig(pending.version.id),
          })
        }
        confirmLabel={pending?.kind === 'delete' ? t('versions.delete') : t('versions.restore')}
        cancelLabel={t('common.cancel')}
        destructive={pending?.kind === 'delete'}
        onConfirm={() => pending && void confirmPending(pending)}
      />
    </Dialog>
  );
}
