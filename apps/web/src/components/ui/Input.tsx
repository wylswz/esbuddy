import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-10 w-full min-w-0 px-3 rounded-md bg-surface border border-border text-sm text-ink',
        'placeholder:text-fg-subtle outline-none transition-colors',
        'focus:border-ink read-only:bg-surface-muted read-only:text-fg-secondary',
        className,
      )}
      {...props}
    />
  );
}
