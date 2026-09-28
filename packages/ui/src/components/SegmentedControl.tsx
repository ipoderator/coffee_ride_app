import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// CR-151 («Постер заезда v2»): a pill row of mutually exclusive options with a
// sliding «thumb» under the chosen one — the cover's «Трек / Карта» switch and
// the ticket's pace-group choice. After 21st ddoemonn/segmented-control, but
// built on native radios inside a `<fieldset>`/`<legend>` (same reasoning as
// `GroupPicker`, CR-119): arrow keys, form semantics and screen-reader
// announcements come from the platform, not re-implemented.
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Second line under the label — the `tall` variant only. */
  description?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** Radio `name` — unique per control on the page. */
  name: string;
  /** Accessible name of the group (the `<legend>`). */
  legend: string;
  /** Show the legend as a small caps label above the pills (default: hidden). */
  showLegend?: boolean;
  options: readonly SegmentedOption<T>[];
  /** `null` — nothing chosen yet: no thumb, every option unchecked. */
  value: T | null;
  onChange: (value: T) => void;
  /** `tall`: two-line options (a group name over its pace). */
  variant?: 'default' | 'tall';
  /** `cover`: on the dark route cover, whatever the UI theme. */
  tone?: 'default' | 'cover';
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  name,
  legend,
  showLegend = false,
  options,
  value,
  onChange,
  variant = 'default',
  tone = 'default',
  disabled = false,
  id,
  className,
}: SegmentedControlProps<T>) {
  const index = options.findIndex((option) => option.value === value);
  const count = Math.max(options.length, 1);
  const tall = variant === 'tall';
  const onCover = tone === 'cover';

  return (
    <fieldset id={id} disabled={disabled} className={cn('min-w-0', className)}>
      <legend
        className={
          showLegend
            ? 'mb-2 font-mono text-label text-text-secondary uppercase'
            : 'sr-only'
        }
      >
        {legend}
      </legend>
      <div
        className={cn(
          'relative isolate grid border p-[3px]',
          tall ? 'rounded-2xl' : 'rounded-full',
          onCover
            ? 'border-cover-line bg-cover-bg/90'
            : 'border-border bg-surface',
        )}
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {index >= 0 ? (
          <span
            aria-hidden="true"
            data-testid="segmented-thumb"
            className={cn(
              'absolute inset-y-[3px] left-[3px] -z-10 shadow-overlay transition-transform duration-300 ease-[cubic-bezier(.3,1.35,.5,1)] motion-reduce:transition-none',
              tall ? 'rounded-xl' : 'rounded-full',
              onCover ? 'bg-cover-ink' : 'bg-bg-raised',
            )}
            style={{
              width: `calc((100% - 6px) / ${count})`,
              transform: `translateX(${index * 100}%)`,
            }}
          />
        ) : null}
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-w-0 cursor-pointer items-center justify-center text-center leading-tight transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-primary has-[:disabled]:cursor-not-allowed',
                tall
                  ? 'min-h-14 flex-col gap-px rounded-xl px-2 py-1.5'
                  : 'min-h-11 rounded-full px-4 py-1.5 text-body-sm font-medium whitespace-nowrap',
                onCover
                  ? checked
                    ? 'text-cover-bg'
                    : 'text-cover-ink/75 hover:text-cover-ink'
                  : checked
                    ? 'text-text'
                    : 'text-text-secondary hover:text-text',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                // Transparent over the whole segment rather than `sr-only`:
                // a click (or a test's `check()`) lands on the radio itself.
                className="absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
              />
              {tall ? (
                <>
                  <span
                    className={cn(
                      'block max-w-full truncate text-body-sm font-semibold',
                      checked && 'text-primary',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="block max-w-full truncate text-xs text-text-secondary tabular-nums">
                      {option.description}
                    </span>
                  ) : null}
                </>
              ) : (
                option.label
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
