'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { UI_TERMS } from '../terminology';

// `'use client'`: this component attaches its own `onClick` handler (the retry
// button) — a Next.js App Router Server Component cannot pass a function prop like
// `onRetry` through a component tree unless the component that actually wires it to a
// DOM event is marked a Client Component boundary itself. Found live (not by any
// jsdom test, which has no RSC serialization step): apps/web's App Router build threw
// "Event handlers cannot be passed to Client Component props" until this was added.
// `Skeleton`/`EmptyState` render no handlers of their own, so they need no directive —
// only whatever a *caller* passes into `EmptyState`'s `action` slot must itself be
// client-interactive if it needs to be, same as any other server/client boundary.
//
// docs/design.md §10 defines two related-but-distinct states this one component
// covers, via `tone`/`variant` instead of a second component:
//
// - point 3, "Error": a plain-language message plus a retry affordance, never a stack
//   trace/HTTP status/raw server string (`.claude/rules/backend.md`) — the default
//   `tone="danger"` + `variant="block"`, `role="alert"` (assertive: the primary content
//   for this region failed outright).
// - point 4, "Degraded" (CR-052, `.claude/rules/resilience.md`): a failing dependency
//   degrades *locally* — e.g. "2GIS unavailable" next to a list that still works, or
//   "Загрузка недоступна" next to a form that still submits — never a blank screen.
//   `tone="warning"` + `variant="inline"`, `role="status"` (polite: this is
//   supplementary information, not a failure of the surrounding content, so it must
//   not interrupt/steal focus the way `alert` can).
//
// `message` is always caller-supplied, on purpose: this module has no way to turn a
// caught error into safe, specific, plain-language Russian text, and doing so
// generically here would risk exactly the "raw server string" leak `backend.md`
// forbids. `retryLabel` defaults through `terminology.ts`'s `UI_TERMS.retry` rather
// than a literal in this file (`.claude/rules/frontend.md`: no hard-coded user-visible
// Russian strings in a component).
export type ErrorStateTone = 'danger' | 'warning';
export type ErrorStateVariant = 'block' | 'inline';

export interface ErrorStateProps {
  /** Plain-language explanation, e.g. "Не удалось загрузить заезды." Never a stack
   * trace, HTTP status code, or raw server string. */
  message: string;
  /** Optional heading above the message, e.g. "Что-то пошло не так". */
  title?: string;
  /** Called when the user activates the retry action. Omit to render no retry button
   * (e.g. a degraded notice with nothing to retry, only to acknowledge). */
  onRetry?: () => void;
  retryLabel?: string;
  /** `danger` (default) for an outright failure, `warning` for a degraded/partial
   * failure (docs/design.md §10 point 4). */
  tone?: ErrorStateTone;
  /** `block` (default): a full replacement for the failed content, centered, more
   * visual weight. `inline`: a compact banner alongside content that still works. */
  variant?: ErrorStateVariant;
  icon?: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<ErrorStateTone, string> = {
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
};

export function ErrorState({
  message,
  title,
  onRetry,
  retryLabel = UI_TERMS.retry,
  tone = 'danger',
  variant = 'block',
  icon,
  className,
}: ErrorStateProps) {
  const isInline = variant === 'inline';
  // Assertive for an outright failure the user must notice now; polite for a
  // degraded-but-usable notice that shouldn't interrupt whatever they're doing.
  const role = tone === 'danger' && !isInline ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={cn(
        'flex gap-3 rounded-md border',
        TONE_STYLES[tone],
        isInline
          ? 'items-center px-4 py-3 text-sm'
          : 'flex-col items-center py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className={isInline ? '' : 'text-2xl'}>
          {icon}
        </div>
      ) : null}
      <div
        className={cn(
          'flex flex-col gap-1',
          isInline ? 'items-start' : 'items-center',
        )}
      >
        {title ? <p className="font-medium text-text">{title}</p> : null}
        <p className={cn(isInline ? '' : 'max-w-sm', 'text-text-secondary')}>
          {message}
        </p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'rounded-md border border-current px-3 py-1.5 text-sm font-medium',
            isInline ? 'ml-auto shrink-0' : 'mt-1',
          )}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
