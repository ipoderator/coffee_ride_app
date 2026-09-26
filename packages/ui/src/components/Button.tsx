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
  // ADR-024 («Ночной старт»): the filled action uses `primary-fill` (button
  // fill), not `primary` (AA text/link/focus role) — the two split apart
  // when the brand hue stopped clearing AA text contrast on its own.
  primary:
    'bg-primary-fill text-on-primary-fill hover:bg-primary-fill-hover disabled:hover:bg-primary-fill',
  // A 1.5px ink rule, no fill of its own (the page shows through).
  secondary:
    'border-[1.5px] border-frame bg-transparent text-text hover:bg-surface disabled:hover:bg-transparent',
  // CR-021 ("Cancel ride"): `docs/design.md` §1's one exception — `danger`
  // (`#D42B20`/`#FF5A4F`), unchanged by ADR-024. An in-page destructive
  // action is an outline in danger red (text + border), not a fill: the
  // fill is reserved for the moment of confirmation (`danger-filled`,
  // `ConfirmDialog`), so the page never carries a solid red block before the
  // user has chosen to act.
  danger:
    'border-[1.5px] border-danger bg-transparent text-danger hover:bg-danger/10 disabled:hover:bg-transparent',
  // ADR-021: additive — the filled red confirm button inside `ConfirmDialog`.
  // `.claude/rules/extensibility.md`: no existing variant renamed, so no call
  // site in either cabinet changes.
  'danger-filled':
    'bg-danger text-on-danger hover:opacity-90 disabled:hover:opacity-100',
} as const;

export type ButtonVariant = keyof typeof VARIANT_STYLES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Duplicate-submit protection (`.claude/rules/frontend.md`'s Forms section):
   * disables the button and swaps in a busy state without the caller having to
   * remember to also pass `disabled`. ADR-024: now also renders a visible
   * spinner (the mockup's Button sheet shows one) instead of only disabling —
   * a busy state with no visual indicator besides the cursor was easy to miss. */
  isLoading?: boolean;
}

/**
 * CR-131: the same classes for a link styled as a button (`next/link` in
 * `apps/web` — `packages/ui` stays router-agnostic, so it can't render the
 * link itself). Additive; `Button` builds its own classes from this too.
 */
export function buttonClassName(
  variant: ButtonVariant = 'primary',
  className?: string,
): string {
  return cn(
    // Touch target 48px on mobile, 44px from `md` (docs/design.md §5);
    // full pill radius, not a stamp (ADR-024 §3); visible 2px focus ring
    // offset 2 (§12).
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-medium transition-colors md:min-h-11',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANT_STYLES[variant],
    className,
  );
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
      className={buttonClassName(variant, className)}
      {...props}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/35 border-t-current"
        />
      ) : null}
      {children}
    </button>
  );
}
