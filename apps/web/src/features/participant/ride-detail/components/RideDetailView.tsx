'use client';

import { useEffect, useState } from 'react';
import type {
  Registration,
  Ride,
  RouteGeometryPoint,
  RouteSummary,
  Stop,
  WaitlistEntry,
} from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Card,
  DifficultyScale,
  ErrorState,
  formatDate,
  formatDistanceParts,
  formatDurationParts,
  formatElevationParts,
  formatParticipantsParts,
  formatPriceParts,
  formatSpeedParts,
  formatTime,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_STATUS_TERMS,
  ROUTE_RENDERING_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { ApiError, getRideDetail, getRouteGeometry } from '../api';
import { ElevationProfileChart } from './ElevationProfileChart';
import { RegistrationButton } from './RegistrationButton';
import { RouteMapPlaceholder } from './RouteMapPlaceholder';
import { StopList } from './StopList';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';
type GeometryStatus = 'loading' | 'ready' | 'error';

/**
 * CR-028: the "Маршрут" section, shown only when `route` (the ride's `RouteSummary`)
 * is non-null. Fetches the full point array separately from the ride's own load
 * (`GetRideResponse.route` deliberately omits `geometry` — KI-035) so a route-render
 * failure degrades locally instead of blanking the rest of the already-loaded page
 * (`.claude/rules/resilience.md`).
 */
function RouteSection({
  rideId,
  route,
}: {
  rideId: string;
  route: RouteSummary;
}) {
  const [status, setStatus] = useState<GeometryStatus>('loading');
  const [points, setPoints] = useState<RouteGeometryPoint[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getRouteGeometry(rideId)
      .then((response) => {
        if (cancelled) return;
        setPoints(response.points);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId, route.id, attempt]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text">
        {ROUTE_RENDERING_TERMS.sectionTitle}
      </h2>
      <RouteMapPlaceholder />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.04em] text-text-secondary">
          {ROUTE_RENDERING_TERMS.elevationProfileLabel}
        </p>
        {status === 'loading' && <Skeleton className="h-40 w-full" />}
        {status === 'error' && (
          <ErrorState
            message={ROUTE_RENDERING_TERMS.elevationProfileLoadError}
            tone="warning"
            variant="inline"
            onRetry={() => setAttempt((n) => n + 1)}
          />
        )}
        {status === 'ready' && <ElevationProfileChart points={points} />}
      </div>
    </div>
  );
}

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
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [registrationsCount, setRegistrationsCount] = useState(0);
  const [viewerRegistration, setViewerRegistration] =
    useState<Registration | null>(null);
  const [viewerWaitlistEntry, setViewerWaitlistEntry] =
    useState<WaitlistEntry | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRideDetail(rideId)
      .then((response) => {
        if (cancelled) return;
        setRide(response.ride);
        setOrganizerName(response.organizer.name);
        setRoute(response.route);
        setStops(response.stops);
        setRegistrationsCount(response.registrationsCount);
        setViewerRegistration(response.viewerRegistration);
        setViewerWaitlistEntry(response.viewerWaitlistEntry);
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
            label={METRIC_TERMS.participants}
            {...formatParticipantsParts(
              registrationsCount,
              ride.participantLimit,
            )}
          />
        )}
      </div>

      <RegistrationButton
        rideId={rideId}
        rideStatus={ride.status}
        participantLimit={ride.participantLimit}
        registrationsCount={registrationsCount}
        viewerRegistration={viewerRegistration}
        viewerWaitlistEntry={viewerWaitlistEntry}
        onChange={(registration) => {
          setViewerRegistration(registration);
          if (registration) {
            setRegistrationsCount((count) => count + 1);
            return;
          }
          // CR-036 ("Waitlist"): cancelling may have silently promoted the oldest
          // waiting entry into the freed spot server-side, so the count might not
          // actually have gone down — refetch instead of guessing
          // (`.claude/rules/database.md`: "live status, not stale coordination").
          getRideDetail(rideId)
            .then((response) => {
              setRegistrationsCount(response.registrationsCount);
              setViewerWaitlistEntry(response.viewerWaitlistEntry);
            })
            .catch(() => {
              // Best-effort refresh only — the cancellation itself already
              // succeeded; a stale count here is not worth surfacing an error for.
            });
        }}
        onWaitlistChange={setViewerWaitlistEntry}
      />

      {route ? <RouteSection rideId={rideId} route={route} /> : null}

      <StopList stops={stops} />
    </div>
  );
}
