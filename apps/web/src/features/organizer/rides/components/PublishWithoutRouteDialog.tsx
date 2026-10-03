'use client';

import Link from 'next/link';
import { Button, buttonClassName, Dialog, RIDE_EDIT_TERMS } from 'ui';

/**
 * CR-192: asked before publishing a ride that has no route. A ride can go out
 * without a track, but the route is draft-only (`docs/api.md`), so it can never
 * be added afterwards — the organizer decides knowingly: publish anyway, or go
 * back (the link, or Esc/the backdrop to stay on the form) and add one.
 * Not `ConfirmDialog`: «Добавить маршрут» is a navigation, not a cancel.
 */
export function PublishWithoutRouteDialog({
  open,
  onClose,
  onConfirm,
  isConfirming = false,
  routeHref,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Publish in flight — duplicate-submit protection. */
  isConfirming?: boolean;
  /** Where «Добавить маршрут» leads (the wizard's route step inside the wizard). */
  routeHref: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={RIDE_EDIT_TERMS.publishNoRouteTitle}
      description={RIDE_EDIT_TERMS.publishNoRouteDescription}
      footer={
        // Stacked: two long labels do not share one row of the narrow dialog
        // (they wrapped to two lines each side by side, even on desktop).
        <div className="flex w-full flex-col gap-3">
          <Link
            href={routeHref}
            className={buttonClassName('secondary', 'w-full')}
          >
            {RIDE_EDIT_TERMS.publishNoRouteAddRoute}
          </Link>
          <Button
            isLoading={isConfirming}
            onClick={onConfirm}
            className="w-full"
          >
            {RIDE_EDIT_TERMS.publishNoRouteConfirm}
          </Button>
        </div>
      }
    />
  );
}
