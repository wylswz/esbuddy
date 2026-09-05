import type { ComponentProps } from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { cx } from './cx';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSeparator = ({ className, ...props }: ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cx('h-px my-1.5 bg-ink-faint', className)} {...props} />
);

export function DropdownMenuContent({ className, children, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        collisionPadding={12}
        className={cx(
          'ui-popover z-40 min-w-56 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto',
          'rounded-md bg-paper border border-ink/10 shadow-xl p-1.5 outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cx('px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle', className)}
      {...props}
    />
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cx(
        'flex items-center gap-2 px-2.5 py-2 rounded-sm text-sm text-ink cursor-default select-none outline-none',
        'data-highlighted:bg-ink data-highlighted:text-paper data-disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
