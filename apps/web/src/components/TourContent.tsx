import { useMemo, type ReactNode } from 'react';
import {
  compileCanvas,
  EDGE_RULES,
  guideBoards,
  OVERLAP_RULES,
  type GuideBoardId,
  type GuideLabel,
  type OverlapRule,
  type Relation,
} from '@esbuddy/sdk';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';
import { ReadOnlyBoard } from './ReadOnlyBoard';

/*
 * Content of the guide's steps: example boards for the workshop steps (the
 * read-only definitions in @esbuddy/sdk `guideBoards.ts`, rendered with the
 * real canvas), the "In Esbuddy" how-to box, and the reference material
 * (formerly the Help dialog). The grammar lists come from the same rules the
 * editor and compiler enforce, and the compile example is real compiler
 * output, so nothing here drifts from the product.
 */

const ALL_ELEMENTS: ElementType[] = ['event', 'command', 'aggregate', 'actor', 'policy', 'external', 'hotspot', 'readmodel', 'note', 'pivotal'];

const ADVANCED_CONCEPTS = ['pivotalEvent', 'swimlane', 'temporalMilestone', 'branch', 'boundedContext', 'levels', 'walkthrough'] as const;

const GRAMMAR_EDGES = (Object.entries(EDGE_RULES) as [ElementType, Partial<Record<ElementType, Relation>>][]).flatMap(
  ([s, targets]) => (Object.entries(targets) as [ElementType, Relation][]).map(([tgt, rel]) => [s, tgt, rel] as const),
);
const GRAMMAR_OVERLAPS = Object.entries(OVERLAP_RULES) as [ElementType, OverlapRule][];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded-sm bg-surface border border-ink/20 text-[11px] font-mono text-ink whitespace-nowrap">
      {children}
    </kbd>
  );
}

const heading = 'font-semibold text-ink mb-1.5';

export function ElementList() {
  const { t } = useI18n();
  return (
    <div className="divide-y divide-ink-faint">
      {ALL_ELEMENTS.map((type) => {
        const s = ELEMENT_STYLES[type];
        return (
          <div key={type} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 items-baseline">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{t(`elements.${type}.label`)}</span>
              {s.shortcut && <span className="ml-auto font-mono text-[11px] text-fg-subtle">{s.shortcut}</span>}
            </span>
            <span className="text-xs text-fg-muted leading-snug">{t(`elements.${type}.description`)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GrammarLists() {
  const { t } = useI18n();
  const name = (type: ElementType) => t(`elements.${type}.label`);
  return (
    <div className="grid sm:grid-cols-2 gap-5 text-sm">
      <div>
        <div className={heading}>{t('help.grammarEdges')}</div>
        <ul className="space-y-1 text-fg-muted">
          {GRAMMAR_EDGES.map(([s, tgt, rel]) => (
            <li key={`${s}-${tgt}`}>
              {name(s)} → {name(tgt)} <span className="text-fg-subtle">· {t(`help.relations.${rel}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className={heading}>{t('help.grammarOverlaps')}</div>
        <ul className="space-y-1 text-fg-muted">
          {GRAMMAR_OVERLAPS.map(([att, rule]) => (
            <li key={att}>
              {t('help.stuckOn', {
                a: name(att),
                b: rule.targets.length > 2 ? t('help.anyNote') : rule.targets.map(name).join(' / '),
              })}{' '}
              <span className="text-fg-subtle">· {t(`help.relations.${rule.relation}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ShortcutList() {
  const { t } = useI18n();
  return (
    <div className="space-y-4 text-sm text-fg-muted">
      <div className="space-y-1.5">
        {ALL_ELEMENTS.filter((type) => ELEMENT_STYLES[type].shortcut).map((type) => (
          <div key={type}>
            <Kbd>{ELEMENT_STYLES[type].shortcut}</Kbd>
            <span className="ml-2">{t('help.addAtCursor', { element: t(`elements.${type}.label`) })}</span>
          </div>
        ))}
        <div>{t('help.search')}</div>
        <div>{t('help.optionClick')}</div>
        <div>{t('help.shiftDragOut')}</div>
        <div>{t('help.zOrder')}</div>
        <div>{t('help.multiSelectShortcut')}</div>
        <div>{t('help.doubleClick')}</div>
      </div>
      <div>
        <div className={heading}>{t('help.modifierRule')}</div>
        <ul className="space-y-1.5">
          <li>
            <Kbd>Shift</Kbd>
            <span className="ml-2">{t('help.breakContainment')}</span>
          </li>
          <li>
            <Kbd>⌥ Option / Alt</Kbd>
            <span className="ml-2">{t('help.createRelation')}</span>
          </li>
          <li>
            <Kbd>⌘ Cmd / Ctrl</Kbd>
            <span className="ml-2">{t('help.multiSelectRule')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ConceptList() {
  const { t } = useI18n();
  return (
    <div className="divide-y divide-ink-faint">
      {ADVANCED_CONCEPTS.map((key) => (
        <div key={key} className="py-2">
          <div className="text-sm font-semibold text-ink">{t(`help.concepts.${key}.term`)}</div>
          <div className="text-xs text-fg-muted leading-snug mt-0.5">{t(`help.concepts.${key}.description`)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Workshop examples ----------

/** The guide's example boards, with localised labels. */
function useGuideBoards() {
  const { t } = useI18n();
  return useMemo(() => guideBoards((key: GuideLabel) => t(`tour.sample.${key}`)), [t]);
}

function Frame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <figure className="rounded-md border border-ink-faint overflow-hidden">
      <figcaption className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle border-b border-ink-faint bg-surface">
        {t('tour.example')}
      </figcaption>
      {children}
    </figure>
  );
}

/** A small, read-only canvas showing one step of the example story. */
export function GuideExample({ board }: { board: GuideBoardId }) {
  const snapshot = useGuideBoards()[board];
  return (
    <Frame>
      <div className="h-52">
        <ReadOnlyBoard snapshot={snapshot} variant="static" />
      </div>
    </Frame>
  );
}

/** The whole example story as a board, and what the compiler makes of it. */
export function CompileExample() {
  const snapshot = useGuideBoards().compile;
  const text = useMemo(() => {
    const result = compileCanvas(snapshot);
    return result.ok ? result.text : '';
  }, [snapshot]);
  return (
    <Frame>
      <div className="h-44 border-b border-ink-faint">
        <ReadOnlyBoard snapshot={snapshot} variant="static" />
      </div>
      <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono text-ink whitespace-pre-wrap bg-surface">{text}</pre>
    </Frame>
  );
}

/** "In Esbuddy": how to do the step here, one action per line. */
export function HowTo({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-md border border-ink/15 px-3.5 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-1">{t('tour.inEsbuddy')}</div>
      <ul className="space-y-1 text-sm text-ink">
        {text.split('\n').map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-fg-subtle">›</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
