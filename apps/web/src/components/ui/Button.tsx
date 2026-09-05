import type { ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element instead of a <button>, merging props (Radix Slot). */
  asChild?: boolean;
}

/*
 * Ink on paper. Primary is solid ink, secondary an ink outline that fills on
 * hover, accent is the single block of colour reserved for the one action a
 * screen is about. Square-ish corners and no shadows, matching the poster.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-inverse-hover',
  secondary: 'border border-ink text-ink hover:bg-ink hover:text-paper',
  ghost: 'text-fg-muted hover:text-ink hover:bg-ink/6',
  accent: 'bg-accent text-ink hover:bg-accent-deep hover:text-paper',
  danger: 'text-fg-muted hover:text-paper hover:bg-danger',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-sm gap-3',
  icon: 'h-8 w-8 p-0',
};

export function Button({ variant = 'primary', size = 'md', asChild, className, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cx(
        'inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap select-none',
        'transition-[background-color,color,transform] active:translate-y-px',
        'disabled:opacity-40 disabled:pointer-events-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
