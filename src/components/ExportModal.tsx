import { useState } from 'react';
import { useI18n } from '../i18n/context';

interface ExportModalProps {
  cml: string;
  onClose: () => void;
}

export function ExportModal({ cml, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const handleCopy = () => {
    navigator.clipboard.writeText(cml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([cml], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'event-storming.cml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{t('export.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm font-mono text-gray-700 whitespace-pre-wrap">{cml}</pre>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={handleCopy}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-700"
          >
            {copied ? t('export.copied') : t('export.copy')}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('export.download')}
          </button>
        </div>
      </div>
    </div>
  );
}
