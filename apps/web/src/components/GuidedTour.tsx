import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { markTourDone } from '../tour';

/*
 * Guided tour — also the editor's help. It follows a workshop in the book's
 * order (events → people → hot spots → structure → vote → process → design →
 * compile), then reference pages. One card that never moves or resizes
 * (so Back / Next stay under the pointer), with a labelled table of contents
 * on the left to jump to any step. While a step is shown, the part of the
 * editor it talks about is spotlit (`data-tour="<id>"`); steps without a
 * target, or whose target isn't on the page, just dim the board. `optional`
 * steps are dropped when their target is missing (e.g. Publish in local mode).
 */

export interface TourStep {
  id: string;
  /** `data-tour` value of the element to spotlight. */
  target?: string;
  /** Heading the step is listed under in the table of contents. */
  group: string;
  title: string;
  body: string;
  /** Drop the step entirely when its target is missing. */
  optional?: boolean;
  /** Reference material under the text (lists, tables). */
  content?: ReactNode;
}

const CARD_W = 760;
const CARD_H = 560;
const PAD = 6;
const MARGIN = 12;

function findTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  const r = el?.getBoundingClientRect();
  return el && r && r.width > 0 && r.height > 0 ? el : null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GuidedTourProps {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
}

export function GuidedTour({ open, steps, onClose }: GuidedTourProps) {
  if (!open) return null;
  return <TourOverlay steps={steps} onClose={onClose} />;
}

function TourOverlay({ steps: allSteps, onClose }: Omit<GuidedTourProps, 'open'>) {
  const { t } = useI18n();
  const steps = useMemo(() => allSteps.filter((s) => !s.optional || findTarget(s.target)), [allSteps]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const finish = useCallback(() => {
    markTourDone();
    onClose();
  }, [onClose]);

  // Spotlight the step's target, following layout changes.
  useLayoutEffect(() => {
    const measure = () => {
      const r = findTarget(step?.target)?.getBoundingClientRect();
      setBox(r ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    nextRef.current?.focus();
  }, [index]);

  if (!step) return null;

  const go = (i: number) => setIndex(Math.max(0, Math.min(i, steps.length - 1)));
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  };

  return createPortal(
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="true" aria-label={t('tour.label')} onKeyDown={onKeyDown}>
      {/* Scrim with a hole around the target, if the step has one on the page. */}
      {box ? (
        <div
          className="absolute rounded-md pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            boxShadow: '0 0 0 9999px color-mix(in srgb, var(--color-ink) 55%, transparent)',
          }}
        >
          <span className="absolute inset-0 rounded-md ring-2 ring-accent animate-pulse" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-ink/55" />
      )}

      {/* Fixed card: same place, same size on every step. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex bg-paper text-ink rounded-md shadow-2xl overflow-hidden"
        style={{
          width: `min(${CARD_W}px, calc(100vw - ${MARGIN * 2}px))`,
          height: `min(${CARD_H}px, calc(100dvh - ${MARGIN * 2}px))`,
        }}
      >
        {/* Table of contents */}
        <nav className="hidden sm:flex flex-col w-52 shrink-0 border-r border-ink-faint bg-surface-muted/60 py-4 overflow-y-auto">
          <ol>
            {steps.map((s, i) => (
              <li key={s.id}>
                {(i === 0 || steps[i - 1].group !== s.group) && (
                  <div className={`px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted ${i === 0 ? '' : 'pt-4'}`}>
                    {s.group}
                  </div>
                )}
                <button
                  onClick={() => go(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={`w-full flex items-baseline gap-2 px-4 py-1.5 text-left text-sm transition-colors ${
                    i === index ? 'bg-ink text-paper font-semibold' : 'text-fg-muted hover:text-ink hover:bg-ink/5'
                  }`}
                >
                  <span className={`w-4 shrink-0 text-right tabular-nums text-xs ${i === index ? 'text-paper/70' : 'text-fg-subtle'}`}>
                    {i + 1}
                  </span>
                  <span className="leading-snug">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Current step */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start gap-3 px-6 pt-5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-1">
                {t('tour.stepOf', { n: String(index + 1), total: String(steps.length) })}
              </div>
              <h2 className="font-display text-xl font-bold tracking-[-0.01em] leading-snug">{step.title}</h2>
            </div>
            <button
              onClick={finish}
              className="shrink-0 -mr-2 p-2 rounded-md text-fg-subtle hover:text-ink hover:bg-ink/6"
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 pb-4">
            <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">{step.body}</p>
            {step.content && <div className="mt-4">{step.content}</div>}
          </div>

          <div className="shrink-0 flex items-center gap-2 px-6 py-4 border-t border-ink-faint whitespace-nowrap">
            {!last && (
              <span className="min-w-0 truncate text-xs text-fg-subtle">
                {t('tour.upNext', { title: steps[index + 1].title })}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => go(index - 1)}
                disabled={index === 0}
                className="shrink-0 h-9 px-3 rounded-sm text-sm font-medium border border-ink/15 hover:bg-ink hover:text-paper disabled:opacity-40 disabled:pointer-events-none"
              >
                {t('tour.back')}
              </button>
              <button
                ref={nextRef}
                onClick={() => (last ? finish() : go(index + 1))}
                className="shrink-0 h-9 px-4 rounded-sm text-sm font-semibold bg-ink text-paper hover:bg-accent hover:text-ink"
              >
                {t(last ? 'tour.done' : 'tour.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
