import type { ReactNode } from 'react';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';
import { SectionLabel } from './PageChrome';
import { Dialog, DialogContent } from './ui/Dialog';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'aggregate', 'actor', 'policy', 'external', 'hotspot', 'readmodel'];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded-sm bg-surface border border-ink/20 text-[11px] font-mono text-ink whitespace-nowrap">
      {children}
    </kbd>
  );
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('help.title')} className="max-w-3xl">
        <div className="space-y-8">
          {/* Elements */}
          <section>
            <SectionLabel className="mb-3">{t('help.elementTypes')}</SectionLabel>
            <div className="divide-y divide-ink-faint">
              {ELEMENT_ORDER.map((type) => {
                const s = ELEMENT_STYLES[type];
                return (
                  <div key={type} className="grid grid-cols-[9.5rem_1fr] gap-4 py-2.5 items-baseline">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{t(`elements.${type}.label`)}</span>
                      {s.shortcut && <span className="ml-auto font-mono text-[11px] text-fg-subtle">{s.shortcut}</span>}
                    </span>
                    <span className="text-sm text-fg-muted">{t(`elements.${type}.description`)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Shortcuts */}
          <section>
            <SectionLabel className="mb-3">{t('help.shortcuts')}</SectionLabel>
            <div className="space-y-2 text-sm text-fg-muted">
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
            <SectionLabel className="mb-3">{t('help.modifierRule')}</SectionLabel>
            <ul className="space-y-2 text-sm text-fg-muted">
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
      </DialogContent>
    </Dialog>
  );
}
