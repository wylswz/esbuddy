import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Button } from './ui/Button';
import { Dialog, DialogContent } from './ui/Dialog';

interface ExportModalProps {
  open: boolean;
  cml: string;
  onClose: () => void;
}

export function ExportModal({ open, cml, onClose }: ExportModalProps) {
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('export.title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleDownload}>
              {t('export.download')}
            </Button>
            <Button onClick={handleCopy} className="min-w-28">
              {copied ? t('export.copied') : t('export.copy')}
            </Button>
          </>
        }
      >
        <pre className="text-xs font-mono leading-relaxed text-ink bg-surface border border-ink/10 rounded-md p-4 whitespace-pre-wrap">
          {cml}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
