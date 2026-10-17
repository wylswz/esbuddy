import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { getVotesMap, readVotes, type CanvasVote } from '@esbuddy/sdk';

/*
 * Dot votes on hot spots live in their own Y.Map (schema in @esbuddy/sdk
 * `ydoc.ts`). Like the board structure they are written straight to the doc
 * and every change — ours, peers', undo — is read back from it.
 */

/** Votes grouped by the note they were cast on. */
export function groupVotes(votes: readonly CanvasVote[]): Map<string, CanvasVote[]> {
  const out = new Map<string, CanvasVote[]>();
  for (const v of votes) out.set(v.nodeId, [...(out.get(v.nodeId) ?? []), v]);
  return out;
}

/**
 * Live votes by note. Votes on deleted notes are kept (undo may bring the
 * note back); they simply have no note to show on.
 */
export function useVotes(doc: Y.Doc): ReadonlyMap<string, CanvasVote[]> {
  const [votes, setVotes] = useState(() => groupVotes(readVotes(doc)));
  useEffect(() => {
    const map = getVotesMap(doc);
    const sync = () => setVotes(groupVotes(readVotes(doc)));
    map.observe(sync);
    sync();
    return () => map.unobserve(sync);
  }, [doc]);
  return votes;
}
