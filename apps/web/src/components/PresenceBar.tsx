import type { PeerState, PeerUser } from '../collab/awareness';
import type { ConnectionStatus } from '../collab/provider';
import { useI18n, type TranslationKey } from '../i18n/context';

interface PresenceBarProps {
  me: PeerUser;
  peers: ReadonlyMap<number, PeerState>;
  status: ConnectionStatus;
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  local: 'bg-fg-subtle',
  connecting: 'bg-amber-500 animate-pulse',
  connected: 'bg-emerald-500',
  disconnected: 'bg-rose-500',
};

function Avatar({ user, title }: { user: PeerUser; title: string }) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-paper"
      style={{ backgroundColor: user.color }}
      title={title}
    >
      {user.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** Who is on this canvas right now (one avatar per user) + link status. */
export function PresenceBar({ me, peers, status }: PresenceBarProps) {
  const { t } = useI18n();
  const statusLabel = t(`presence.${status}` as TranslationKey);
  // Several tabs of the same user share one avatar.
  const others = new Map<string, PeerUser>();
  peers.forEach((p) => others.set(p.user.id, p.user));

  return (
    <div className="editor-chip flex h-9 items-center gap-2 px-2.5" title={statusLabel}>
      <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} aria-label={statusLabel} />
      <div className="flex -space-x-1.5">
        <Avatar user={me} title={t('presence.you', { name: me.name })} />
        {Array.from(others.values()).map((u) => (
          <Avatar key={u.id} user={u} title={u.name} />
        ))}
      </div>
    </div>
  );
}
