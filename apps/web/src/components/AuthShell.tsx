import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';

/**
 * Full-bleed "poster" layout for the screens a visitor sees before entering
 * the app (login, invite). No logo, no product name: the left field is a
 * single block of the Event colour carrying a short statement about how a
 * domain model takes shape; the right side is quiet paper for the form.
 *
 * On narrow screens the field collapses to a banner above the form.
 */
interface AuthShellProps {
  children: ReactNode;
}

/**
 * The core Event Storming vocabulary, in the order a model usually gets built.
 * Rendered monochrome on purpose: the field is already one saturated colour,
 * so the sequence is carried by type and tone, not by more hues. The Event
 * step is the only solid chip — it is the thing the whole method pivots on.
 */
const FLOW = ['actor', 'command', 'aggregate', 'event', 'policy'] as const;

export function AuthShell({ children }: AuthShellProps) {
  const { t, locale, setLocale } = useI18n();
  const delay = (i: number) => ({ animationDelay: `${i * 90}ms` });

  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row bg-paper text-ink overflow-y-auto lg:overflow-hidden">
      {/* Colour field */}
      <section className="poster-field relative flex flex-col justify-between shrink-0 lg:w-[54%] lg:h-full min-h-[46vh] lg:min-h-0 px-7 py-8 sm:px-12 sm:py-12 lg:px-16 lg:py-14">
        <p
          className="poster-enter text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-ink-soft"
          style={delay(0)}
        >
          {t('auth.eyebrow')}
        </p>

        <div className="my-10 lg:my-0">
          <h1
            className="poster-enter font-display font-bold tracking-[-0.035em] leading-[0.95] text-[clamp(2.75rem,7.5vw,7rem)] text-ink"
            style={delay(1)}
          >
            {t('auth.headline')}
          </h1>
          <p
            className="poster-enter mt-6 max-w-md text-base sm:text-lg leading-snug text-ink-soft"
            style={delay(2)}
          >
            {t('auth.lede')}
          </p>
        </div>

        <div className="poster-enter hidden sm:block" style={delay(3)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft mb-3">
            {t('auth.flowLabel')}
          </p>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium">
            {FLOW.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={
                    step === 'event'
                      ? 'flex items-baseline gap-2 rounded-sm bg-ink text-paper px-3 py-1.5'
                      : 'flex items-baseline gap-2 rounded-sm border border-ink/30 text-ink px-3 py-1.5'
                  }
                >
                  <span className="text-[10px] tabular-nums opacity-60">{String(i + 1).padStart(2, '0')}</span>
                  {t(`elements.${step}.label`)}
                </span>
                {i < FLOW.length - 1 && <span className="text-ink/40 select-none">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-ink-soft">{t('auth.footnote')}</p>
        </div>
      </section>

      {/* Paper */}
      <section className="relative flex-1 flex flex-col lg:h-full lg:overflow-y-auto">
        <div className="flex justify-end px-6 pt-5 sm:px-10 lg:px-14 lg:pt-8">
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="text-xs font-medium text-fg-subtle hover:text-fg transition-colors"
          >
            {t('toolbar.switchLanguage')}
          </button>
        </div>
        <div
          className="flex-1 flex items-center px-6 py-10 sm:px-10 lg:px-14"
          style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="poster-enter w-full max-w-sm mx-auto lg:mx-0 lg:ml-[12%]" style={delay(2)}>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
