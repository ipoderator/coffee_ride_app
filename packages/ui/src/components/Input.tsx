import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// Meant to be used inside `FormField`, which wires `id`/`aria-describedby`/
// `aria-invalid` onto whatever control it wraps — this component itself only
// needs to render those attributes and look right, not manage them.
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        // `border-input` token (docs/design.md §3: dedicated form-control-boundary
        // tone, AA against `bg`); 44px min touch target + 8px radius (§5); 16px body
        // text (§4) so mobile Safari never zooms on focus.
        'min-h-11 w-full rounded-lg border border-border-input bg-bg-raised px-3 text-base text-text placeholder:text-text-muted',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'aria-invalid:border-danger',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
