import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Plus,
  Undo2,
  Redo2,
  CircleHelp,
  Search,
} from 'lucide-react';
import { ELEMENT_ORDER, ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';

interface ToolbarProps {
  onAddElement: (type: ElementType) => void;
  placingType?: ElementType;
  onHelp: () => void;
  /** Open global search (⌘K): tools without a button of their own, and notes. */
  onSearch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Touch device: render the floating FAB + sheet instead of the docked desktop panel. */
  touchMode: boolean;
}


const btn =
  'flex items-center gap-2 h-9 px-2.5 text-[13px] font-semibold text-ink hover:bg-ink hover:text-paper transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink';

const iconBtn = `${btn} flex-1 justify-center border border-ink/15`;

// Mobile tiles: roomy square targets (>= 64px) with the label under the icon.
const tile =
  'flex flex-col items-center justify-center gap-1.5 border border-ink/30 bg-surface active:bg-ink active:text-paper transition-colors text-[11px] font-semibold text-ink leading-tight text-center disabled:opacity-40 min-h-16 px-1';

const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted';

interface Action {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function Toolbar({
  onAddElement,
  placingType,
  onHelp,
  onSearch,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  touchMode,
}: ToolbarProps) {
  const { t, locale, setLocale } = useI18n();
  // Touch: a floating sheet toggled by a FAB. Desktop: always docked top-left.
  const [open, setOpen] = useState(false);

  const addElement = (type: ElementType) => {
    onAddElement(type);
    setOpen(false);
  };

  const actions: Action[] = [
    {
      key: 'search',
      icon: <Search size={20} />,
      label: t('palette.open'),
      onClick: () => {
        setOpen(false);
        onSearch();
      },
    },
    { key: 'undo', icon: <Undo2 size={20} />, label: t('toolbar.undo'), onClick: onUndo, disabled: !canUndo, title: `${t('toolbar.undo')} (⌘Z)` },
    { key: 'redo', icon: <Redo2 size={20} />, label: t('toolbar.redo'), onClick: onRedo, disabled: !canRedo, title: `${t('toolbar.redo')} (⌘⇧Z)` },
    {
      key: 'help',
      icon: <CircleHelp size={20} />,
      label: t('toolbar.help'),
      onClick: () => {
        setOpen(false);
        onHelp();
      },
    },
  ];

  const languageToggle = (
    <button
      onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
      className="text-xs font-medium text-fg-subtle hover:text-ink transition-colors"
    >
      {t('toolbar.switchLanguage')}
    </button>
  );

  if (touchMode) {
    return (
      <>
        <button
          data-tour="elements"
          onClick={() => setOpen((o) => !o)}
          className="editor-fab safe-bottom absolute right-4 z-30 w-14 h-14 rounded-full border border-ink bg-accent text-ink flex items-center justify-center active:scale-95 transition-transform"
          title={open ? t('toolbar.closeMenu') : t('toolbar.openMenu')}
          aria-label={open ? t('toolbar.closeMenu') : t('toolbar.openMenu')}
          aria-expanded={open}
        >
          <Plus
            size={26}
            className={`transition-transform duration-300 ease-out ${open ? 'rotate-45' : 'rotate-0'}`}
          />
        </button>

        {/* Tap-outside scrim */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 z-10 bg-scrim/20 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        <div
          style={{ '--safe-offset': '5.5rem' } as CSSProperties}
          className={`editor-chip editor-toolbar safe-bottom absolute left-3 right-3 z-20 flex flex-col gap-3 p-3 max-h-[70dvh] overflow-y-auto origin-bottom-right transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <div className={eyebrow}>{t('toolbar.addElement')}</div>
            {languageToggle}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {ELEMENT_ORDER.map((type) => {
              const s = ELEMENT_STYLES[type];
              return (
                <button key={type} onClick={() => addElement(type)} className={tile} aria-pressed={placingType === type}>
                  <span className="w-5 h-5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span>{t(`elements.${type}.label`)}</span>
                </button>
              );
            })}
          </div>

          <div className="h-px bg-ink-faint" />

          <div className="grid grid-cols-3 gap-2">
            {actions.map((a) => (
              <button key={a.key} onClick={a.onClick} disabled={a.disabled} className={tile}>
                {a.icon}
                <span>{a.label}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] leading-snug text-fg-subtle px-1">{t('toolbar.touchHint')}</div>
        </div>
      </>
    );
  }

  return (
    <div className="editor-chip editor-toolbar absolute top-4 left-4 z-10 flex flex-col gap-2 p-3 w-52 max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className={eyebrow}>{t('toolbar.addElement')}</div>
        {languageToggle}
      </div>

      <button data-tour="search" onClick={onSearch} className={`${btn} border border-ink/15 text-fg-muted`}>
        <Search size={16} />
        <span>{t('palette.open')}</span>
        <span className="ml-auto text-[10px] font-mono text-fg-subtle">⌘K</span>
      </button>

      <div data-tour="elements" className="flex flex-col gap-0.5">
        {ELEMENT_ORDER.map((type) => {
          const s = ELEMENT_STYLES[type];
          return (
            <button
              key={type}
              onClick={() => onAddElement(type)}
              aria-pressed={placingType === type}
              className={`${btn} group`}
              style={placingType === type ? { backgroundColor: s.paperColor, color: 'var(--color-ink)' } : undefined}
            >
              <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span>{t(`elements.${type}.label`)}</span>
              <span className="ml-auto text-[10px] font-mono text-fg-subtle group-hover:text-paper/70">{s.shortcut}</span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-ink-faint my-1" />

      <div className="flex gap-1.5">
        <button onClick={onUndo} disabled={!canUndo} className={iconBtn} title={`${t('toolbar.undo')} (⌘Z)`}>
          <Undo2 size={16} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={iconBtn} title={`${t('toolbar.redo')} (⌘⇧Z)`}>
          <Redo2 size={16} />
        </button>
      </div>

      <button data-tour="help" onClick={onHelp} className={btn}>
        <CircleHelp size={16} />
        <span>{t('toolbar.help')}</span>
      </button>

      <div className="text-[10px] leading-relaxed text-fg-muted px-1">
        <div>{t('toolbar.placeHint')}</div>
        <div className="mt-1">{t('toolbar.writeHint')}</div>
      </div>
    </div>
  );
}
