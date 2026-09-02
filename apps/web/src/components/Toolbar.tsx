import { useState, type ReactNode } from 'react';
import {
  Plus,
  Undo2,
  Redo2,
  Group,
  BringToFront,
  SendToBack,
  CircleHelp,
} from 'lucide-react';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';
import { ColorDot } from './ColorDot';

interface ToolbarProps {
  onAddElement: (type: ElementType) => void;
  onGroupAggregate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onHelp: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
}

const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'actor', 'policy', 'external', 'hotspot', 'readmodel'];

const btn =
  'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed';

// Mobile tiles: roomy square targets (>= 64px) with the label under the icon.
const tile =
  'flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white shadow-sm active:bg-gray-100 active:scale-95 transition-transform text-[11px] font-medium text-gray-700 leading-tight text-center disabled:opacity-40 min-h-16 px-1';

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
  onGroupAggregate,
  onBringToFront,
  onSendToBack,
  onHelp,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canGroup,
}: ToolbarProps) {
  const { t, locale, setLocale } = useI18n();
  // On small screens the toolbar is a floating sheet toggled by a FAB; on desktop it's always docked top-left.
  const [open, setOpen] = useState(false);

  const addElement = (type: ElementType) => {
    onAddElement(type);
    setOpen(false);
  };

  const actions: Action[] = [
    { key: 'undo', icon: <Undo2 size={20} />, label: t('toolbar.undo'), onClick: onUndo, disabled: !canUndo, title: `${t('toolbar.undo')} (⌘Z)` },
    { key: 'redo', icon: <Redo2 size={20} />, label: t('toolbar.redo'), onClick: onRedo, disabled: !canRedo, title: `${t('toolbar.redo')} (⌘⇧Z)` },
    { key: 'group', icon: <Group size={20} />, label: t('toolbar.groupAsAggregate'), onClick: onGroupAggregate, disabled: !canGroup },
    { key: 'front', icon: <BringToFront size={20} />, label: t('toolbar.bringToFront'), onClick: onBringToFront },
    { key: 'back', icon: <SendToBack size={20} />, label: t('toolbar.sendToBack'), onClick: onSendToBack },
    { key: 'help', icon: <CircleHelp size={20} />, label: t('toolbar.help'), onClick: onHelp },
  ];

  const languageToggle = (
    <button
      onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
      className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
    >
      {t('toolbar.switchLanguage')}
    </button>
  );

  return (
    <>
      {/* ---------- Mobile: FAB + animated bottom sheet ---------- */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="md:hidden absolute bottom-5 right-4 z-30 w-14 h-14 rounded-full bg-gray-900 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
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
        className={`md:hidden absolute inset-0 z-10 bg-black/20 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        className={`md:hidden absolute left-3 right-3 bottom-22 z-20 flex flex-col gap-3 bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-3 max-h-[70vh] overflow-y-auto origin-bottom-right transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('toolbar.addElement')}</div>
          {languageToggle}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {ELEMENT_ORDER.map((type) => {
            const s = ELEMENT_STYLES[type];
            return (
              <button
                key={type}
                onClick={() => addElement(type)}
                className={tile}
                style={{ backgroundColor: s.bgColor }}
              >
                <span className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                <span>{t(`elements.${type}.label`)}</span>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-gray-200" />

        <div className="grid grid-cols-3 gap-2">
          {actions.map((a) => (
            <button key={a.key} onClick={a.onClick} disabled={a.disabled} className={tile}>
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        <div className="text-[11px] leading-snug text-gray-400 px-1">{t('toolbar.touchHint')}</div>
      </div>

      {/* ---------- Desktop: docked panel ---------- */}
      <div className="hidden md:flex absolute top-4 left-4 z-10 flex-col gap-2 bg-white/90 backdrop-blur rounded-xl shadow-lg p-3 w-56">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('toolbar.addElement')}</div>
          {languageToggle}
        </div>

        <div className="flex flex-col gap-1.5">
          {ELEMENT_ORDER.map((type) => {
            const s = ELEMENT_STYLES[type];
            return (
              <button key={type} onClick={() => onAddElement(type)} className={btn}>
                <ColorDot color={s.color} />
                <span>{t(`elements.${type}.label`)}</span>
                <span className="ml-auto text-[10px] text-gray-400 font-mono">{s.shortcut}</span>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-gray-200 my-1" />

        <div className="flex gap-1.5">
          <button onClick={onUndo} disabled={!canUndo} className={`${btn} flex-1 justify-center`} title={`${t('toolbar.undo')} (⌘Z)`}>
            <Undo2 size={16} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} className={`${btn} flex-1 justify-center`} title={`${t('toolbar.redo')} (⌘⇧Z)`}>
            <Redo2 size={16} />
          </button>
        </div>

        <div className="h-px bg-gray-200 my-1" />

        <button onClick={onGroupAggregate} disabled={!canGroup} className={btn}>
          <Group size={16} />
          <span>{t('toolbar.groupAsAggregate')}</span>
        </button>

        <div className="flex gap-1.5">
          <button onClick={onBringToFront} className={`${btn} flex-1 justify-center`} title={t('toolbar.bringToFront')}>
            <BringToFront size={16} />
          </button>
          <button onClick={onSendToBack} className={`${btn} flex-1 justify-center`} title={t('toolbar.sendToBack')}>
            <SendToBack size={16} />
          </button>
        </div>

        <div className="h-px bg-gray-200 my-1" />

        <button onClick={onHelp} className={btn}>
          <CircleHelp size={16} />
          <span>{t('toolbar.help')}</span>
        </button>

        <div className="text-[10px] leading-snug text-gray-400 px-1">
          <div className="font-semibold text-gray-500 mb-0.5">{t('toolbar.modifierKeys')}</div>
          <div>{t('toolbar.shiftDragOut')}</div>
          <div>{t('toolbar.optionClick')}</div>
        </div>
      </div>
    </>
  );
}
