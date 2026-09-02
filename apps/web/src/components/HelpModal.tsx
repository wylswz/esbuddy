import type { ReactNode } from 'react';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';
import { ColorDot } from './ColorDot';

interface HelpModalProps {
  onClose: () => void;
}

const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'aggregate', 'actor', 'policy', 'external', 'hotspot', 'readmodel'];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-surface-muted border border-border-strong text-xs font-mono text-fg-secondary whitespace-nowrap">
      {children}
    </kbd>
  );
}

export function HelpModal({ onClose }: HelpModalProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40" onClick={onClose}>
      <div
        className="bg-surface rounded-lg shadow-2xl w-[680px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-fg">{t('help.title')}</h2>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg-muted text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Elements */}
          <section>
            <h3 className="text-sm font-semibold text-fg-secondary mb-3">{t('help.elementTypes')}</h3>
            <div className="space-y-2.5">
              {ELEMENT_ORDER.map((type) => {
                const s = ELEMENT_STYLES[type];
                return (
                  <div key={type} className="flex items-start gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{
                        backgroundColor: s.bgColor,
                        color: s.color,
                        border: `1px solid ${s.borderColor}`,
                      }}
                    >
                      <ColorDot color={s.color} />
                      <span>{t(`elements.${type}.label`)}</span>
                      {s.shortcut && <span className="font-mono opacity-60">{s.shortcut}</span>}
                    </span>
                    <span className="text-sm text-fg-muted pt-0.5">{t(`elements.${type}.description`)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Shortcuts */}
          <section>
            <h3 className="text-sm font-semibold text-fg-secondary mb-3">{t('help.shortcuts')}</h3>
            <div className="space-y-1.5 text-sm text-fg-muted">
              {ELEMENT_ORDER.filter((type) => ELEMENT_STYLES[type].shortcut).map((type) => (
                <div key={type}>
                  <Kbd>{ELEMENT_STYLES[type].shortcut}</Kbd>
                  <span className="ml-2">{t('help.addAtCursor', { element: t(`elements.${type}.label`) })}</span>
                </div>
              ))}
              <div>{t('help.shiftDragOut')}</div>
              <div>{t('help.optionClick')}</div>
              <div>{t('help.zOrder')}</div>
              <div>{t('help.multiSelectShortcut')}</div>
              <div>{t('help.doubleClick')}</div>
            </div>
          </section>

          {/* Modifier keys */}
          <section>
            <h3 className="text-sm font-semibold text-fg-secondary mb-3">{t('help.modifierRule')}</h3>
            <ul className="space-y-1.5 text-sm text-fg-muted list-disc list-inside">
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
          </section>
        </div>
      </div>
    </div>
  );
}
