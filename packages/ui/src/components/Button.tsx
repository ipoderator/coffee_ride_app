'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// First interactive-form primitive (CR-011) — none of `Button`/`Input`/`FormField`/
// `Card` exist yet (docs/design.md §9 lists all four in `packages/ui`'s inventory).
// Hand-vendored against our own tokens, same precedent as `Skeleton` (KI-020).
//
// `'use client'`: carries no `onClick` itself, but every real usage (RegisterForm and
// beyond) passes one from a Client Component — same reasoning `ErrorState` documented
// (CR-066) for the same shape of component.
const VARIANT_STYLES = {
  primary:
    'bg-primary text-on-primary hover:opacity-90 disabled:hover:opacity-100',
  secondary:
    'border border-border-input bg-bg-raised text-text hover:bg-bg disabled:hover:bg-bg-raised',
  // CR-021 ("Cancel ride"): `docs/design.md`'s one exception to the calm palette —
  // `danger` (`#D42B20`/`#FF5A4F`) is the only token allowed as a solid fill outside
  // `StatusBadge`'s own single solid-fill case (CR-065). Additive variant —
  // `.claude/rules/extensibility.md`: `variant` still defaults to `primary`, no
  // existing call site changes.
  danger:
    'bg-danger text-on-danger hover:opacity-90 disabled:hover:opacity-100',
} as const;

export type ButtonVariant = keyof typeof VARIANT_STYLES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Duplicate-submit protection (`.claude/rules/frontend.md`'s Forms section):
   * disables the button and swaps in a busy state without the caller having to
   * remember to also pass `disabled`. */
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        // 44px min touch target (docs/design.md §5); 8px radius (§5); visible
        // 2px focus ring offset 2 (§12).
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-opacity',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
