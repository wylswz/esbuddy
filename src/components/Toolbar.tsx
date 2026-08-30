import { ELEMENT_STYLES, type ElementType } from '../types';

interface ToolbarProps {
  onAddElement: (type: ElementType) => void;
  onExport: () => void;
  onImport: (cml: string) => void;
  onGroupAggregate: () => void;
  canGroup: boolean;
}

const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'actor', 'policy', 'external'];

export function Toolbar({ onAddElement, onExport, onImport, onGroupAggregate, canGroup }: ToolbarProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white rounded-lg shadow-lg p-3 border border-gray-200">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Add Element</div>
      <div className="flex flex-col gap-1.5">
        {ELEMENT_ORDER.map((type) => {
          const s = ELEMENT_STYLES[type];
          return (
            <button
              key={type}
              onClick={() => onAddElement(type)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: s.bgColor,
                color: s.color,
                border: `1px solid ${s.borderColor}`,
              }}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-gray-200 my-1" />

      <button
        onClick={onGroupAggregate}
        disabled={!canGroup}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: ELEMENT_STYLES.aggregate.bgColor,
          color: ELEMENT_STYLES.aggregate.color,
          border: `1px solid ${ELEMENT_STYLES.aggregate.borderColor}`,
        }}
      >
        <span>{ELEMENT_STYLES.aggregate.icon}</span>
        <span>Group as Aggregate</span>
      </button>

      <div className="h-px bg-gray-200 my-1" />

      <div className="flex flex-col gap-1.5">
        <button
          onClick={onExport}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
        >
          Export CML
        </button>
        <label className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer text-center">
          Import CML
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
      </div>

      <div className="h-px bg-gray-200 my-1" />

      <p className="text-[10px] leading-snug text-gray-400">
        Hold <span className="font-semibold text-gray-500">Shift</span> and drag an element out
        to remove it from its aggregate.
      </p>
    </div>
  );
}
