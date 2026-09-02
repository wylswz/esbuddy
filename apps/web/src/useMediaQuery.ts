import { useEffect, useState } from 'react';

/** Reactive `window.matchMedia` — re-renders when the query's match state changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/*
 * Single source of truth for "is this a touch device". Both the layout (floating
 * toolbar vs docked panel) and the interaction scheme (long-press to drag) key off
 * this, so a tablet never ends up with a desktop toolbar but touch gestures.
 * `pointer: coarse` describes the primary input device, unlike UA sniffing or
 * `'ontouchstart' in window` (true on touch-enabled laptops with a mouse).
 */
export function useTouchMode(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
