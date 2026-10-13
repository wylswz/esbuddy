import { Switch as S } from 'radix-ui';
import { cx } from './cx';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** On/off toggle: ink track when on, a paper thumb that slides across. */
export function Switch({ checked, onCheckedChange, disabled, id, className, ...rest }: SwitchProps) {
  return (
    <S.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-ink/20 transition-colors',
        'bg-surface-muted data-[state=checked]:bg-ink data-[state=checked]:border-ink',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        className,
      )}
    >
      <S.Thumb className="block h-3.5 w-3.5 rounded-full bg-paper shadow-sm ring-1 ring-ink/15 transition-transform translate-x-0.5 data-[state=checked]:translate-x-[1.125rem]" />
    </S.Root>
  );
}
