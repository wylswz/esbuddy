import {
  Undo2,
  Redo2,
  Group,
  BringToFront,
  SendToBack,
  Download,
  Upload,
  CircleHelp,
} from 'lucide-react';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useI18n } from '../i18n/context';
import { ColorDot } from './ColorDot';

interface ToolbarProps {
  onAddElement: (type: ElementType) => void;
  onExport: () => void;
  onImport: (cml: string) => void;
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

export function Toolbar({
  onAddElement,
  onExport,
  onImport,
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

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur rounded-xl shadow-lg p-3 w-56">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {t('toolbar.addElement')}
        </div>
        <button
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
        >
          {t('toolbar.switchLanguage')}
        </button>
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
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`${btn} flex-1 justify-center`}
          title={`${t('toolbar.undo')} (⌘Z)`}
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`${btn} flex-1 justify-center`}
          title={`${t('toolbar.redo')} (⌘⇧Z)`}
        >
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

      <button onClick={onExport} className={btn}>
        <Download size={16} />
        <span>{t('toolbar.exportCml')}</span>
      </button>
      <label className={`${btn} cursor-pointer justify-center`}>
        <Upload size={16} />
        <span>{t('toolbar.importCml')}</span>
        <input
          type="file"
          accept=".cml,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                onImport(reader.result as string);
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />
      </label>

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
  );
}
