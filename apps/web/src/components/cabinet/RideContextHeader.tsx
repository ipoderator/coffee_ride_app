'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Ride } from 'types';
import {
  ErrorState,
  formatRideStartLine,
  RIDE_CONTEXT_TERMS,
  RIDE_LIST_TERMS,
  RIDE_STATUS_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { fetchOwnRide } from '@/lib/organizer/own-rides';
import { isRideOverdue } from '@/lib/rides/overdue';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; ride: Ride; now: Date };

/**
 * CR-185 (UX handoff P1): which ride a per-ride organizer page is about —
 * its title, start, status (plus «Требует решения» for a start that passed
 * unstarted, the shared `isRideOverdue`) and a link to its management view.
 * The sidebar's «Участники»/«Обновления» open the nearest ride's page
 * (`NearestRideRedirect`, CR-131); without this the page said only
 * «Участники», with no hint whose list it was. Shared by both target pages,
 * so it lives with the cabinet frame rather than in either feature module.
 */
export function RideContextHeader({ rideId }: { rideId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchOwnRide(rideId)
      .then((ride) => {
        if (!cancelled) setState({ status: 'ready', ride, now: new Date() });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, attempt]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-6 w-72 max-w-full" />
        <Skeleton className="h-5 w-56 max-w-full" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        message={RIDE_CONTEXT_TERMS.loadError}
        variant="inline"
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  const { ride, now } = state;
  const status = RIDE_STATUS_TERMS[ride.status];

  return (
    <section
      aria-label={RIDE_CONTEXT_TERMS.label}
      className="flex flex-col gap-2"
    >
      <p className="text-h3 text-text wrap-anywhere">{ride.title}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge label={status.label} tone={status.tone} />
        {isRideOverdue(ride, now) && (
          <StatusBadge label={RIDE_LIST_TERMS.overdueBadge} tone="warning" />
        )}
        <span className="font-mono text-label text-text-secondary uppercase tabular-nums">
          {formatRideStartLine(new Date(ride.startsAt), {
            timeZone: ride.startTimezone,
          })}
        </span>
        <Link
          href={`/organizer/rides/${ride.id}/edit`}
          className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
        >
          {RIDE_CONTEXT_TERMS.manageLink} →
        </Link>
      </div>
    </section>
  );
}
