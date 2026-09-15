'use client';

import { useEffect, useState } from 'react';
import type { Ride } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Card,
  DifficultyScale,
  ErrorState,
  formatDate,
  formatDistanceParts,
  formatDurationParts,
  formatElevationParts,
  formatPriceParts,
  formatSpeedParts,
  formatTime,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_STATUS_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { ApiError, getRideDetail } from '../api';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/rides/[id]` (`docs/design.md` §8 "Ride detail", CR-023). Public — no
 * `CabinetShell`, no session required (`.claude/context/current-task.md`).
 * `GET /v1/rides/:id` 404s `ride_not_found` for a non-existent id, a `draft` ride, or
 * a `draft` ride belonging to someone else — this view shows the same not-found state
 * for all three, never revealing which (same discipline `EditRideForm` follows for
 * its own owner-scoped 404).
 */
export function RideDetailView({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [ride, setRide] = useState<Ride | null>(null);
  const [organizerName, setOrganizerName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    getRideDetail(rideId)
      .then((response) => {
        if (cancelled) return;
        setRide(response.ride);
        setOrganizerName(response.organizer.name);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          error.problem.code === 'ride_not_found'
        ) {
          setStatus('not-found');
          return;
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-medium text-text">
          {RIDE_DETAIL_TERMS.notFoundTitle}
        </p>
        <p className="max-w-sm text-sm text-text-secondary">
          {RIDE_DETAIL_TERMS.notFoundDescription}
        </p>
      </Card>
    );
  }

  if (status === 'error' || !ride) {
    return <ErrorState message={RIDE_DETAIL_TERMS.loadError} />;
  }

  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startDate = new Date(ride.startsAt);

  return (
    <div className="flex flex-col gap-6">
      {ride.coverImageUrl ? (
        // `coverImageUrl` is always `null` today (KI-023, no S3 pipeline yet);
        // `next/image` needs a configured remote pattern this codebase doesn't have
        // yet either. Revisit once a real value can ever reach this branch.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ride.coverImageUrl}
          alt=""
          className="h-64 w-full rounded-xl object-cover"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
        </div>
        <h1 className="text-2xl font-semibold text-text">{ride.title}</h1>
        <p className="text-sm text-text-secondary">
          {RIDE_DETAIL_TERMS.organizedByLabel}: {organizerName}
        </p>
      </div>

      <Card className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.04em] text-text-secondary">
          {RIDE_DETAIL_TERMS.startLabel}
        </p>
        <p className="text-lg font-semibold text-text">
          {formatDate(startDate, { timeZone: ride.startTimezone })}
          {', '}
          {formatTime(startDate, { timeZone: ride.startTimezone })}
        </p>
      </Card>

      {ride.description && (
        <p className="whitespace-pre-wrap text-sm text-text">
          {ride.description}
        </p>
      )}

      <MetricRow>
        {ride.distanceKm !== null && (
          <MetricTile
            label={METRIC_TERMS.distance}
            {...formatDistanceParts(ride.distanceKm)}
          />
        )}
        {ride.elevationGainMeters !== null && (
          <MetricTile
            label={METRIC_TERMS.elevation}
            {...formatElevationParts(ride.elevationGainMeters)}
          />
        )}
        {ride.paceKmh !== null && (
          <MetricTile
            label={METRIC_TERMS.pace}
            {...formatSpeedParts(ride.paceKmh)}
          />
        )}
        {ride.durationMinutes !== null && (
          <MetricTile
            label={METRIC_TERMS.duration}
            {...formatDurationParts(ride.durationMinutes)}
          />
        )}
      </MetricRow>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {ride.difficulty !== null && (
          <DifficultyScale level={ride.difficulty} />
        )}
        <span className="text-sm text-text-secondary">
          {BICYCLE_TYPE_TERMS[ride.bicycleType]}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <MetricTile
          label={RIDE_DETAIL_TERMS.priceLabel}
          {...formatPriceParts(ride.priceRub)}
        />
        {ride.participantLimit !== null && (
          <MetricTile
            label={RIDE_DETAIL_TERMS.participantLimitLabel}
            value={String(ride.participantLimit)}
          />
        )}
      </div>
    </div>
  );
}
