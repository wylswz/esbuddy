import type { ReactNode } from 'react';
import { AlertDialog as A } from 'radix-ui';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Replacement for `window.confirm`: a small, focused sheet with two actions.
 * Destructive confirms render the primary action in the danger colour.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="ui-overlay fixed inset-0 z-50 bg-ink/60" />
        <A.Content className="ui-dialog fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-sm bg-paper text-ink rounded-md shadow-2xl outline-none p-6 flex flex-col gap-6">
          <div>
            <A.Title className="font-display text-2xl font-bold tracking-[-0.02em] leading-tight">{title}</A.Title>
            {description && <A.Description className="mt-2 text-sm text-fg-muted">{description}</A.Description>}
          </div>
          <div className="flex gap-3">
            <A.Cancel asChild>
              <Button variant="secondary" className="flex-1">
                {cancelLabel}
              </Button>
            </A.Cancel>
            <A.Action asChild>
              <Button
                onClick={onConfirm}
                className={destructive ? 'flex-1 bg-danger text-paper hover:bg-hotspot' : 'flex-1'}
              >
                {confirmLabel}
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
