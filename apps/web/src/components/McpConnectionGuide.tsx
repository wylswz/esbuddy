import { useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
import { useI18n } from '../i18n/context.js';
import { mcpClientConfig, mcpServerUrl, type McpClient } from '../mcp.js';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';
import { Select } from './ui/Select.js';

export function McpConnectionGuide({ token, identityName }: { token: string; identityName: string }) {
  const { t } = useI18n();
  const [client, setClient] = useState<McpClient>('cursor');
  const [copied, setCopied] = useState<'url' | 'config' | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const url = mcpServerUrl(import.meta.env.VITE_API_URL ?? '/api', window.location.href);
  const config = mcpClientConfig(client, url, token);

  const copy = async (kind: 'url' | 'config', value: string) => {
    setCopied(null);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <section aria-label={t('tokens.mcp.title')} className="flex min-w-0 flex-col gap-4 border-t border-ink/15 pt-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Plug size={16} />
          {t('tokens.mcp.title')}
        </h3>
        <p className="mt-1.5 wrap-break-word text-xs leading-relaxed text-fg-muted">
          {t('tokens.mcp.hint', { name: identityName })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mcp-server-url" className="text-xs text-fg-muted">{t('tokens.mcp.url')}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="mcp-server-url" aria-label={t('tokens.mcp.url')} readOnly value={url}
            onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button type="button" variant="secondary" onClick={() => void copy('url', url)} className="shrink-0">
            {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'url' ? t('workspacePage.copied') : t('tokens.mcp.copyUrl')}
          </Button>
        </div>
        <p className="text-[11px] text-fg-muted">{t('tokens.mcp.transport')}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{t('tokens.mcp.client')}</span>
          <Select<McpClient> value={client} aria-label={t('tokens.mcp.client')} className="w-full min-w-0"
            onValueChange={(value) => { setClient(value); setCopied(null); setCopyFailed(false); }}
            options={[
              { value: 'cursor', label: 'Cursor' },
              { value: 'vscode', label: 'VS Code' },
              { value: 'windsurf', label: 'Windsurf' },
            ]} />
        </div>
        <Button type="button" variant="secondary" onClick={() => void copy('config', config)}>
          {copied === 'config' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'config' ? t('workspacePage.copied') : t('tokens.mcp.copyConfig')}
        </Button>
      </div>

      <textarea aria-label={t('tokens.mcp.config')} readOnly value={config} rows={13} wrap="off"
        spellCheck={false} autoComplete="off" autoCapitalize="off"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full min-w-0 resize-y rounded-md border border-ink/15 bg-paper p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-ink"
      />
      <p className="text-xs leading-relaxed text-fg-muted">{t(`tokens.mcp.${client}Hint`)}</p>
      {copyFailed && <p role="status" className="text-xs text-hotspot">{t('tokens.mcp.copyFailed')}</p>}
      {copied && <span role="status" className="sr-only">{t('workspacePage.copied')}</span>}

      <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-relaxed text-fg-muted">
        <li>{t('tokens.mcp.connect')}</li>
        <li>{t('tokens.mcp.verify')}</li>
      </ol>
      <p className="border-l-2 border-accent pl-3 text-xs leading-relaxed text-ink">{t('tokens.mcp.security')}</p>
    </section>
  );
}
