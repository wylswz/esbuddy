import { useState } from 'react';
import { CircleAlert, TriangleAlert, X } from 'lucide-react';
import { isElementType, type CanvasNode, type CompileResult, type Diagnostic } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { diagnosticColor } from '../CanvasContext';
import { Button } from './ui/Button';

interface CompilePanelProps {
  result: CompileResult;
  nodes: ReadonlyMap<string, CanvasNode>;
  fileName: string;
  onFocus: (d: Diagnostic) => void;
  onClose: () => void;
}

/**
 * Non-modal side panel: lists what stops the board from compiling (live, so it
 * can stay open while the user fixes the board), then the compiled text.
 */
export function CompilePanel({ result, nodes, fileName, onFocus, onClose }: CompilePanelProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

  const typeName = (id: string | undefined) => {
    const type = id ? nodes.get(id)?.type : undefined;
    return type && isElementType(type) ? t(`elements.${type}.label`) : (type ?? '?');
  };
  const noteName = (id: string | undefined) => {
    const n = id ? nodes.get(id) : undefined;
    const label = typeof n?.data?.label === 'string' ? n.data.label.trim() : '';
    return label ? `“${label}”` : t('compile.untitled', { type: typeName(id) });
  };
  const message = (d: Diagnostic) => {
    const [a, b] = d.nodeIds;
    return t(`compile.diagnostics.${d.code}`, {
      a: noteName(a),
      b: noteName(b),
      aType: typeName(a),
      bType: typeName(b),
    });
  };

  const handleCopy = () => {
    if (!result.ok) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => {
    if (!result.ok) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.trim() || 'event-storming'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const list = (items: Diagnostic[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((d, i) => {
        const Icon = d.severity === 'error' ? CircleAlert : TriangleAlert;
        return (
          <li key={`${d.code}-${i}`}>
            <button
              onClick={() => onFocus(d)}
              className="w-full flex items-start gap-2 text-left text-xs leading-snug text-ink rounded-sm px-2 py-1.5 hover:bg-ink/6"
            >
              <Icon size={14} className="shrink-0 mt-px" style={{ color: diagnosticColor(d.severity) }} />
              <span>{message(d)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className="editor-chip absolute right-4 top-16 bottom-4 z-20 w-100 max-w-[calc(100vw-2rem)] flex flex-col"
      aria-label={t('compile.title')}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-ink-faint">
        <h2 className="text-sm font-semibold">{t('compile.title')}</h2>
        <span className="ml-auto text-[11px] text-fg-muted">
          {t('compile.summary', { errors: String(errors.length), warnings: String(warnings.length) })}
        </span>
        <button onClick={onClose} className="p-1 rounded-sm hover:bg-ink/6" title={t('common.close')} aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {result.ok ? (
          <>
            <pre className="text-xs font-mono leading-relaxed text-ink bg-surface border border-ink/10 rounded-md p-3 whitespace-pre-wrap">
              {result.text}
            </pre>
            {warnings.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-fg-muted px-2">
                  {t('compile.warnings', { count: String(warnings.length) })}
                </summary>
                <div className="mt-1">{list(warnings)}</div>
              </details>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-fg-muted px-2">{t('compile.blocked')}</p>
            {list(result.diagnostics)}
          </>
        )}
      </div>

      {result.ok && (
        <footer className="flex justify-end gap-2 px-3 py-3 border-t border-ink-faint">
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            {t('compile.download')}
          </Button>
          <Button size="sm" onClick={handleCopy} className="min-w-24">
            {copied ? t('compile.copied') : t('compile.copy')}
          </Button>
        </footer>
      )}
    </aside>
  );
}
