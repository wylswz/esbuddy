import type { ReactNode } from 'react';
import { cx } from './ui/cx';

/*
 * Shared chrome for the in-app pages (gallery, workspace). Same language as
 * the poster screens, turned down: paper background, ink type, one thin bar
 * of the accent colour under the masthead instead of a whole field of it.
 */

interface PageShellProps {
  children: ReactNode;
  /** Content max-width; the gallery is wider than a settings page. */
  width?: 'wide' | 'narrow';
}

const WIDTH = { wide: 'max-w-6xl', narrow: 'max-w-3xl' };

export function PageShell({ children, width = 'wide' }: PageShellProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-paper text-ink">
      <div
        className={cx('mx-auto px-6 sm:px-10', WIDTH[width])}
        style={{ paddingBottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </div>
    </div>
  );
}

/** Thin utility bar at the top: navigation on the left, account on the right. */
export function PageBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="h-14 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}

interface MastheadProps {
  eyebrow: ReactNode;
  title: ReactNode;
  /** Right-aligned actions, wrap under the title on narrow screens. */
  actions?: ReactNode;
}

export function Masthead({ eyebrow, title, actions }: MastheadProps) {
  return (
    <section className="pt-8 sm:pt-12 pb-6 mb-8 border-b border-ink-faint relative">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fg-muted">{eyebrow}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h1 className="font-display font-bold tracking-[-0.03em] leading-[0.95] text-[clamp(2.25rem,5vw,4rem)] wrap-break-word min-w-0">
          {title}
        </h1>
        {actions && <div className="flex items-center gap-2 pb-1">{actions}</div>}
      </div>
      <span aria-hidden className="absolute left-0 -bottom-px h-1 w-24 bg-accent" />
    </section>
  );
}

/** Small uppercase heading used above groups of content. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cx('text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted', className)}>{children}</h2>
  );
}
