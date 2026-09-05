import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { cx } from './cx';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  /** Bottom action row. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/*
 * Modal dialog: ink scrim, paper sheet, display-face title with a hairline
 * under it. Radix provides focus trap, Esc, scroll lock and aria wiring.
 */
export function DialogContent({ title, description, footer, children, className }: DialogContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="ui-overlay fixed inset-0 z-50 bg-ink/60" />
      <D.Content
        className={cx(
          'ui-dialog fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100vw-2rem)] max-w-2xl max-h-[85dvh] flex flex-col',
          'bg-paper text-ink rounded-md shadow-2xl outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-6 px-6 pt-6 pb-4 border-b border-ink-faint">
          <div className="min-w-0">
            <D.Title className="font-display text-2xl font-bold tracking-[-0.02em] leading-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1.5 text-sm text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="shrink-0 -m-2 p-2 rounded-md text-fg-subtle hover:text-ink hover:bg-ink/6 transition-colors focus-visible:outline-2 focus-visible:outline-ink"
            aria-label="Close"
          >
            <X size={18} />
          </D.Close>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 px-6 py-4 border-t border-ink-faint">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
