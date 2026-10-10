'use client';

import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

/**
 * CR-231: a labelled native `<select>` for an admin list filter (user kind,
 * ride status) — `packages/ui` has no Select primitive, and a native one keeps
 * the platform's own picker on a phone. Same field look as `Input`.
 */
export function AdminSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-body-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => {
            const next = options.find(
              (option) => option.value === event.target.value,
            );
            if (next) onChange(next.value);
          }}
          className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border border-border-input bg-bg-raised py-2 pr-10 pl-3 text-body text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-secondary"
        />
      </div>
    </div>
  );
}
