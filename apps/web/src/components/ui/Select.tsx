import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import { cx } from './cx';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  className?: string;
  'aria-label'?: string;
}

/** Styled single-value select; keyboard + typeahead come from Radix. */
export function Select<T extends string>({ value, onValueChange, options, className, ...rest }: SelectProps<T>) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <S.Trigger
        aria-label={rest['aria-label']}
        className={cx(
          'inline-flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-border bg-surface text-sm text-ink',
          'outline-none transition-colors hover:border-ink data-[state=open]:border-ink focus-visible:border-ink',
          className,
        )}
      >
        <S.Value />
        <S.Icon>
          <ChevronDown size={16} className="text-fg-subtle" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="ui-popover z-40 min-w-(--radix-select-trigger-width) rounded-md bg-paper border border-ink/10 shadow-xl p-1.5"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-sm text-sm text-ink cursor-default select-none outline-none data-highlighted:bg-ink data-highlighted:text-paper"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator>
                  <Check size={14} />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
