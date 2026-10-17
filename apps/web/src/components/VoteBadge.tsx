import { Vote } from 'lucide-react';
import { useCanvasActions, useNodeVotes } from '../CanvasContext';
import { userColor } from '../collab/awareness';
import { useI18n } from '../i18n/context';

const MAX_DOTS = 5;

/**
 * Dot votes on a hot spot: one coloured dot per voter and the total. Clicking
 * casts or takes back this user's vote; hovering lists who voted. Read-only
 * boards only show it once there are votes.
 */
export function VoteBadge({ nodeId }: { nodeId: string }) {
  const votes = useNodeVotes(nodeId);
  const { toggleVote, voterId, readOnly } = useCanvasActions();
  const { t } = useI18n();
  const canVote = !readOnly && !!toggleVote;
  if (!canVote && votes.length === 0) return null;

  const mine = votes.some((v) => v.userId === voterId);
  const title = [
    votes.length > 0 ? t('node.votedBy', { names: votes.map((v) => v.name).join(', ') }) : null,
    canVote ? t(mine ? 'node.unvote' : 'node.vote') : null,
  ]
    .filter(Boolean)
    .join('\n');
  const body = (
    <>
      {votes.length === 0 ? (
        <Vote size={12} />
      ) : (
        votes
          .slice(0, MAX_DOTS)
          .map((v) => <span key={v.userId} className="h-2 w-2 rounded-full" style={{ backgroundColor: userColor(v.userId) }} />)
      )}
      <span className="tabular-nums">{votes.length}</span>
    </>
  );
  const className = `absolute bottom-1.5 right-1.5 flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-bold leading-none ${
    mine ? 'bg-ink text-paper' : 'bg-white/75 text-ink'
  }`;

  if (!canVote) {
    return (
      <span className={className} title={title}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`nodrag nopan ${className} shadow-sm hover:ring-2 hover:ring-ink/40`}
      title={title}
      aria-pressed={mine}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        toggleVote(nodeId);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {body}
    </button>
  );
}
