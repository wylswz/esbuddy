import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { Node } from 'reactflow';
import { useI18n } from '../i18n/context';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { cx } from './ui/cx';

/*
 * Global search (⌘K / Ctrl+K). One box for two things:
 *   - tools that deliberately have no toolbar button or shortcut (pivotal
 *     events, swimlanes, milestones…) alongside the everyday ones;
 *   - the notes on the board, by title or memo — picking one jumps to it,
 *     which is also how a large board is explored.
 */

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  /** Extra search terms (both languages, synonyms). */
  keywords?: string;
  icon?: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  nodes: readonly Node[];
  onFocusNode: (id: string) => void;
}

const MAX_NOTES = 30;

type Item = { key: string; section: 'tools' | 'notes'; run: () => void; render: ReactNode };

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export function CommandPalette({ open, onOpenChange, commands, nodes, onFocusNode }: CommandPaletteProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {open && (
        <PaletteContent commands={commands} nodes={nodes} onFocusNode={onFocusNode} close={() => onOpenChange(false)} />
      )}
    </D.Root>
  );
}

function PaletteContent({
  commands,
  nodes,
  onFocusNode,
  close,
}: Omit<CommandPaletteProps, 'open' | 'onOpenChange'> & { close: () => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (...parts: string[]) => !q || parts.some((p) => p.toLowerCase().includes(q));
    const tools: Item[] = commands
      .filter((c) => match(c.label, c.hint ?? '', c.keywords ?? ''))
      .map((c) => ({
        key: `cmd:${c.id}`,
        section: 'tools',
        run: c.run,
        render: (
          <>
            <span className="w-4 shrink-0 flex justify-center text-fg-muted">{c.icon}</span>
            <span className="font-medium">{c.label}</span>
            {c.hint && <span className="ml-auto pl-3 text-xs text-fg-subtle truncate">{c.hint}</span>}
          </>
        ),
      }));
    // Notes only once something is typed: an empty query lists the tools.
    const notes: Item[] = !q
      ? []
      : nodes
          .filter((n) => match(text(n.data?.label), text(n.data?.description)))
          .slice(0, MAX_NOTES)
          .map((n) => {
            const type = n.type as ElementType;
            return {
              key: `node:${n.id}`,
              section: 'notes',
              run: () => onFocusNode(n.id),
              render: (
                <>
                  <span
                    className="h-3 w-3 mx-0.5 rounded-sm shrink-0"
                    style={{ backgroundColor: ELEMENT_STYLES[type]?.color ?? 'var(--color-board-line)' }}
                  />
                  <span className="font-medium truncate">{text(n.data?.label) || t(`elements.${type}.label`)}</span>
                  <span className="ml-auto pl-3 text-xs text-fg-subtle shrink-0">{t(`elements.${type}.label`)}</span>
                </>
              ),
            };
          });
    return [...tools, ...notes];
  }, [query, commands, nodes, onFocusNode, t]);

  const current = Math.min(active, items.length - 1);
  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  return (
    <D.Portal>
      <D.Overlay className="ui-overlay fixed inset-0 z-50 bg-ink/40" />
      <D.Content
        className="ui-dialog fixed left-1/2 top-[15dvh] z-50 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-xl max-h-[65dvh] flex flex-col bg-paper text-ink rounded-md shadow-2xl outline-none overflow-hidden"
        aria-describedby={undefined}
      >
        <D.Title className="sr-only">{t('palette.open')}</D.Title>
        <div className="flex items-center gap-2.5 px-4 border-b border-ink-faint">
          <Search size={16} className="text-fg-subtle shrink-0" />
          <input
            autoFocus
            value={query}
            placeholder={t('palette.placeholder')}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = items.length;
                if (n) setActive((current + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(items[current]);
              }
            }}
            className="flex-1 h-12 bg-transparent outline-none text-sm placeholder:text-fg-subtle"
          />
          <kbd className="px-1.5 py-0.5 rounded-sm border border-ink/20 text-[10px] font-mono text-fg-subtle">Esc</kbd>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1.5" role="listbox">
          {items.length === 0 && <div className="px-4 py-6 text-sm text-fg-muted text-center">{t('palette.empty')}</div>}
          {items.map((item, i) => (
            <div key={item.key}>
              {(i === 0 || items[i - 1].section !== item.section) && (
                <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
                  {t(item.section === 'tools' ? 'palette.tools' : 'palette.notes')}
                </div>
              )}
              <button
                role="option"
                aria-selected={i === current}
                ref={i === current ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => choose(item)}
                className={cx(
                  'w-full flex items-center gap-2.5 px-4 h-9 text-sm text-left',
                  i === current ? 'bg-ink text-paper **:text-paper' : 'text-ink',
                )}
              >
                {item.render}
              </button>
            </div>
          ))}
        </div>
      </D.Content>
    </D.Portal>
  );
}
