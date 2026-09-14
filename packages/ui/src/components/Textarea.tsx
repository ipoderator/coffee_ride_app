import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// CR-013's first consumer (a profile bio field); `docs/design.md` §9 already
// listed this in `packages/ui`'s intended inventory alongside `Input`. Same
// tier/styling as `Input` — meant to sit inside `FormField`, which wires
// `id`/`aria-describedby`/`aria-invalid` onto whatever control it wraps.
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        // Same border-input/44px-minimum-height/8px-radius/16px-text tokens as
        // `Input` (docs/design.md §3-§5) — `min-h-11` here is a floor, not the
        // resting height; `rows` sets the real one.
        'min-h-11 w-full resize-y rounded-lg border border-border-input bg-bg-raised px-3 py-2 text-base text-text placeholder:text-text-muted',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'aria-invalid:border-danger',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
