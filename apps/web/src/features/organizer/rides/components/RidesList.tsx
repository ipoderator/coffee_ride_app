'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RIDE_STATUSES, type Ride } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Card,
  EmptyState,
  ErrorState,
  MetricRow,
  MetricTile,
  RIDE_CREATE_TERMS,
  RIDE_LIST_TERMS,
  RIDE_STATUS_TERMS,
  Skeleton,
  StatusBadge,
  formatDate,
  formatTime,
} from 'ui';
import { listMyRides } from '../api';

type LoadStatus = 'loading' | 'ready' | 'error';

function groupByStatus(rides: Ride[]): Array<[Ride['status'], Ride[]]> {
  const groups = new Map<Ride['status'], Ride[]>();
  for (const ride of rides) {
    const group = groups.get(ride.status);
    if (group) {
      group.push(ride);
    } else {
      groups.set(ride.status, [ride]);
    }
  }
  // `RIDE_STATUSES`' own declared order (draft -> ... -> cancelled), not insertion
  // order — a status with no rides yet is simply omitted, not shown empty.
  return RIDE_STATUSES.filter((status) => groups.has(status)).map(
    (status) => [status, groups.get(status)!] as [Ride['status'], Ride[]],
  );
}

/**
 * `/organizer/rides` (`docs/design.md` §8 "My rides, grouped by status", CR-088).
 * Fetches the caller's own rides (any status, `GET /v1/rides/mine`) and groups them
 * client-side by `RIDE_STATUSES`' declared order. Each card links into
 * `/organizer/rides/[id]/edit` (CR-018) — the reachability gap `.claude/context/
 * known-issues.md` KI-024 flagged is what this screen closes.
 */
export function RidesList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<Ride[]>([]);

  useEffect(() => {
    let cancelled = false;

    listMyRides()
      .then((response) => {
        if (cancelled) return;
        setRides(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={RIDE_LIST_TERMS.loadError} />;
  }

  if (rides.length === 0) {
    return (
      <EmptyState
        title={RIDE_LIST_TERMS.emptyTitle}
        description={RIDE_LIST_TERMS.emptyDescription}
        action={
          <Link
            href="/organizer/rides/new"
            className="text-sm font-medium text-primary hover:underline"
          >
            {RIDE_LIST_TERMS.createLink}
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/organizer/rides/new"
        className="self-start text-sm font-medium text-primary hover:underline"
      >
        {RIDE_LIST_TERMS.createLink}
      </Link>

      {groupByStatus(rides).map(([groupStatus, groupRides]) => (
        <section key={groupStatus} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-secondary">
            {RIDE_STATUS_TERMS[groupStatus].label}
          </h2>
          <div className="flex flex-col gap-3">
            {groupRides.map((ride) => {
              const startDate = new Date(ride.startsAt);
              return (
                <Link key={ride.id} href={`/organizer/rides/${ride.id}/edit`}>
                  <Card className="flex flex-col gap-3 transition-opacity hover:opacity-90">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-text">
                        {ride.title}
                      </p>
                      <StatusBadge
                        label={RIDE_STATUS_TERMS[ride.status].label}
                        tone={RIDE_STATUS_TERMS[ride.status].tone}
                      />
                    </div>
                    <MetricRow>
                      <MetricTile
                        label={RIDE_LIST_TERMS.summaryStartLabel}
                        value={formatDate(startDate, {
                          timeZone: ride.startTimezone,
                        })}
                        unit={formatTime(startDate, {
                          timeZone: ride.startTimezone,
                        })}
                      />
                      <MetricTile
                        label={RIDE_CREATE_TERMS.summaryBicycleTypeLabel}
                        value={BICYCLE_TYPE_TERMS[ride.bicycleType]}
                      />
                    </MetricRow>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
