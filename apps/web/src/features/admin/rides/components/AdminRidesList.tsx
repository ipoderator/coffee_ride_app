'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RIDE_STATUSES, type AdminRideListItem, type RideStatus } from 'types';
import {
  ADMIN_TERMS,
  Button,
  Card,
  RIDE_STATUS_TERMS,
  SegmentedControl,
  StatusBadge,
  formatRideStartLine,
  useToast,
} from 'ui';
import { AdminListBody } from '@/components/admin/AdminListBody';
import { AdminReasonDialog } from '@/components/admin/AdminReasonDialog';
import { AdminSearchForm } from '@/components/admin/AdminSearchForm';
import { AdminSelect } from '@/components/admin/AdminSelect';
import { adminActionErrorMessage } from '@/lib/admin/errors';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminUrlFilters } from '@/lib/admin/use-admin-url-filters';
import { ADMIN_VISIBILITY_OPTIONS } from '@/lib/admin/visibility';
import {
  cancelAdminRide,
  hideAdminRide,
  listAdminRides,
  unhideAdminRide,
  type AdminRidesFilters,
} from '../api';
import { RIDES_FILTER_DEFAULTS, parseRidesFilters } from '../filters';

const STATUS_OPTIONS: ReadonlyArray<{
  value: AdminRidesFilters['status'];
  label: string;
}> = [
  { value: 'any', label: ADMIN_TERMS.anyStatus },
  ...RIDE_STATUSES.map((status) => ({
    value: status,
    label: RIDE_STATUS_TERMS[status].label,
  })),
];

/** Mirrors `CANCELLABLE_STATUSES` in `apps/api` `rides.service.ts`: only a
 * ride that is announced and not yet started can be cancelled. */
const CANCELLABLE: ReadonlySet<RideStatus> = new Set([
  'published',
  'registration_open',
  'registration_closed',
]);

type ReasonDialog = { kind: 'hide' | 'cancel'; ride: AdminRideListItem } | null;

/**
 * CR-231 (ADR-032): `/admin/rides` — every ride, any organizer, any status,
 * newest first. Hide takes a ride out of every public surface (the owner still
 * sees it); cancel goes through the organizer's own cancel path, participant
 * notifications included.
 */
export function AdminRidesList() {
  const { showToast } = useToast();
  // CR-232: `?q=&status=&visibility=` — the URL is the filters' only copy.
  const [filters, setFilters] = useAdminUrlFilters(
    parseRidesFilters,
    RIDES_FILTER_DEFAULTS,
  );
  const { state, loadMore, replace, retry } = useAdminList<AdminRideListItem>(
    JSON.stringify(filters),
    (cursor) => listAdminRides(filters, cursor),
  );
  const [dialog, setDialog] = useState<ReasonDialog>(null);
  const [unhidingId, setUnhidingId] = useState<string | null>(null);

  async function handleUnhide(ride: AdminRideListItem) {
    setUnhidingId(ride.id);
    try {
      replace(await unhideAdminRide(ride.id));
      showToast(ADMIN_TERMS.unhideRideDone, 'success');
    } catch (error) {
      showToast(adminActionErrorMessage(error), 'danger');
    } finally {
      setUnhidingId(null);
    }
  }

  async function handleReason(reason: string): Promise<string | null> {
    if (!dialog) return null;
    try {
      if (dialog.kind === 'hide') {
        replace(await hideAdminRide(dialog.ride.id, reason));
        showToast(ADMIN_TERMS.hideRideDone, 'success');
      } else {
        replace(await cancelAdminRide(dialog.ride.id, reason));
        showToast(ADMIN_TERMS.cancelRideDone, 'success');
      }
      return null;
    } catch (error) {
      return adminActionErrorMessage(error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{ADMIN_TERMS.ridesTitle}</h1>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <AdminSearchForm
          label={ADMIN_TERMS.searchRidesLabel}
          initialValue={filters.q}
          onSearch={(q) => setFilters({ q })}
        />
        <AdminSelect
          label={ADMIN_TERMS.rideStatusLabel}
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(status) => setFilters({ status })}
        />
        <SegmentedControl
          name="admin-ride-visibility"
          legend={ADMIN_TERMS.visibilityLegend}
          options={ADMIN_VISIBILITY_OPTIONS}
          value={filters.visibility}
          onChange={(visibility) => setFilters({ visibility })}
        />
      </div>
      <AdminListBody
        state={state}
        onRetry={retry}
        onLoadMore={loadMore}
        emptyTitle={ADMIN_TERMS.ridesEmpty}
        emptyDescription={ADMIN_TERMS.emptyHint}
      >
        {(items) => (
          <Card className="p-4 md:p-5">
            <ul className="flex flex-col">
              {items.map((ride) => (
                <RideRow
                  key={ride.id}
                  ride={ride}
                  isUnhiding={unhidingId === ride.id}
                  onHide={() => setDialog({ kind: 'hide', ride })}
                  onUnhide={() => void handleUnhide(ride)}
                  onCancel={() => setDialog({ kind: 'cancel', ride })}
                />
              ))}
            </ul>
          </Card>
        )}
      </AdminListBody>
      <AdminReasonDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog?.kind === 'cancel'
            ? ADMIN_TERMS.cancelRideTitle
            : ADMIN_TERMS.hideRideTitle
        }
        description={
          dialog?.kind === 'cancel'
            ? ADMIN_TERMS.cancelRideDescription
            : ADMIN_TERMS.hideRideDescription
        }
        subject={
          dialog
            ? [{ label: ADMIN_TERMS.subjectRide, value: dialog.ride.title }]
            : []
        }
        reasonHint={
          dialog?.kind === 'cancel'
            ? ADMIN_TERMS.reasonHintLogOnly
            : ADMIN_TERMS.reasonHintOrganizerVisible
        }
        confirmLabel={
          dialog?.kind === 'cancel'
            ? ADMIN_TERMS.cancelRide
            : ADMIN_TERMS.hideRide
        }
        onSubmit={handleReason}
      />
    </div>
  );
}

function RideRow({
  ride,
  isUnhiding,
  onHide,
  onUnhide,
  onCancel,
}: {
  ride: AdminRideListItem;
  isUnhiding: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onCancel: () => void;
}) {
  const status = RIDE_STATUS_TERMS[ride.status];
  // A hidden ride or a draft 404s on its public page, for the admin too.
  const isPublic = ride.hiddenAt === null && ride.status !== 'draft';
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-none last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-body font-medium text-text">
          {isPublic ? (
            <Link
              href={`/rides/${ride.id}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {ride.title}
            </Link>
          ) : (
            ride.title
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ride.hiddenAt ? (
            <StatusBadge label={ADMIN_TERMS.badgeHidden} tone="warning" />
          ) : null}
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
      </div>
      <p className="text-body-sm text-text-secondary">
        {ADMIN_TERMS.columnStart}:{' '}
        {formatRideStartLine(new Date(ride.startsAt), {
          timeZone: ride.timezone,
        })}
        {' · '}
        {ADMIN_TERMS.columnRegistrations}: {ride.activeRegistrations}
      </p>
      <p className="text-body-sm text-text-secondary">
        {ADMIN_TERMS.columnOrganizer}:{' '}
        <Link
          href={`/admin/users/${ride.organizer.userId}`}
          className="rounded-sm text-text underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {ride.organizer.name}
        </Link>
      </p>
      {ride.hiddenReason ? (
        <p className="break-words text-body-sm text-text">
          {ADMIN_TERMS.reasonLine(ride.hiddenReason)}
        </p>
      ) : null}
      <div
        role="group"
        aria-label={`${ADMIN_TERMS.columnActions}: ${ride.title}`}
        className="flex flex-wrap gap-2"
      >
        {ride.hiddenAt ? (
          <Button variant="secondary" isLoading={isUnhiding} onClick={onUnhide}>
            {ADMIN_TERMS.unhide}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onHide}>
            {ADMIN_TERMS.hideRide}
          </Button>
        )}
        {CANCELLABLE.has(ride.status) ? (
          <Button variant="danger" onClick={onCancel}>
            {ADMIN_TERMS.cancelRide}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
