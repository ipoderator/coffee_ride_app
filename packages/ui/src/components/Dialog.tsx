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
//
// CR-232: `description` may be rich content (a string stays the common case) — the
// admin reason dialog puts the record it acts on there, so the target is part of the
// dialog's accessible description, not just visible text below it. Hence a `<div>`.
// The panel scrolls vertically (`max-h-full overflow-y-auto`) when that content
// outgrows a short phone screen, instead of being cut off above and below.
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
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
    if (!open) return;
    // CR-185: closing hands focus back to whatever opened the dialog (WCAG
    // 2.4.3), unless that control is gone — e.g. a confirmed action removed
    // its own button.
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
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
          'relative max-h-full w-full max-w-sm overflow-y-auto rounded-xl border',
          'border-border bg-surface p-6',
          'shadow-overlay focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        <p id={titleId} className="text-h3 text-text">
          {title}
        </p>
        {description ? (
          <div
            id={descriptionId}
            className="mt-2 text-body text-text-secondary"
          >
            {description}
          </div>
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
