'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

// `docs/design.md` §9 has listed `Dialog` in `packages/ui`'s inventory since CR-063,
// but nothing ever built it (KI-020) — the actual root cause the `/impeccable critique
// apps/web` P0 finding traced `RegistrationButton`'s missing cancel-confirmation to
// (`.claude/context/current-task.md`, CR-103). Generic modal primitive; `ConfirmDialog`
// is the destructive-action-specific wrapper built on top of this one.
//
// Backdrop reuses the existing `--color-text` token at reduced opacity rather than a
// new token — a `--scrim` token is a separate, not-yet-authorized visual-direction
// item. `shadow-overlay` (`tokens.css`, defined since CR-063, unused until now) is
// exactly the "elevation for overlays" token this is for.
//
// ADR-021 («Топокарта»): the dialog sits on `surface` (the sheet margin), the one
// raised plane — `bg-raised` is the same paper as the page since that ADR.
//
// `createPortal`: renders outside `RideDetailView`'s own DOM position so the overlay
// isn't clipped by an ancestor's `overflow`/stacking context — same reasoning any
// modal implementation needs. Guarded by the `!open` early return above it, so this
// never runs during a server render where a caller's initial `open` state is `true`
// (every real call site in this codebase initializes it `false`); `document` would be
// undefined server-side otherwise.
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-text/50"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-sm rounded-xl border border-border bg-surface p-6',
          'shadow-overlay focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        <p id={titleId} className="text-lg font-semibold text-text">
          {title}
        </p>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm text-text-secondary">
            {description}
          </p>
        ) : null}
        {children}
        {footer ? (
          <div className="mt-6 flex justify-end gap-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
