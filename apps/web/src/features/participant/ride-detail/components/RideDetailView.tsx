'use client';

import Image from 'next/image';
import { type ReactNode, useEffect, useState } from 'react';
import type {
  Registration,
  Review,
  Ride,
  RouteGeometryPoint,
  RoutePoint,
  RouteSummary,
  Stop,
  WaitlistEntry,
} from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Card,
  cn,
  DifficultyScale,
  ErrorState,
  formatDate,
  formatDistanceParts,
  formatDurationParts,
  formatElevationParts,
  formatParticipantsParts,
  formatPriceParts,
  formatRating,
  formatSpeedParts,
  formatTime,
  GLASS_PANEL_CLASSNAME,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_STATUS_TERMS,
  ROUTE_RENDERING_TERMS,
  REVIEWS_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import {
  ApiError,
  getRideDetail,
  getRideReviews,
  getRouteGeometry,
} from '../api';
import { ElevationProfileChart } from './ElevationProfileChart';
import { RegistrationButton } from './RegistrationButton';
import { RouteMap } from './RouteMap';
import { RouteMapPlaceholder } from './RouteMapPlaceholder';
import { ReviewForm } from './ReviewForm';
import { ReviewList, type ReviewListStatus } from './ReviewList';
import { StopList } from './StopList';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';
type GeometryStatus = 'loading' | 'ready' | 'error';

/**
 * CR-028: the "Маршрут" panel. Shown when the ride has anything to put on a
 * map — an uploaded route, stops, route points, or just a start point. With a
 * route, fetches the full point array separately from the ride's own load
 * (`GetRideResponse.route` deliberately omits `geometry` — KI-035) so a
 * route-render failure degrades locally instead of blanking the rest of the
 * already-loaded page (`.claude/rules/resilience.md`).
 *
 * Layout: one panel, the map as its dominant surface with the stop list as a
 * narrow side column at `md` (a ride's "splits" next to its map), and the
 * elevation profile full-width underneath.
 */
function RoutePanel({
  rideId,
  route,
  routePoints,
  stops,
  start,
}: {
  rideId: string;
  route: RouteSummary | null;
  routePoints: RoutePoint[];
  stops: Stop[];
  start: { lat: number; lng: number } | null;
}) {
  const [status, setStatus] = useState<GeometryStatus>(
    route ? 'loading' : 'ready',
  );
  const [points, setPoints] = useState<RouteGeometryPoint[]>([]);
  const [attempt, setAttempt] = useState(0);
  const routeId = route?.id ?? null;

  useEffect(() => {
    if (!routeId) return;
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
  }, [rideId, routeId, attempt]);

  const hasSideColumn = stops.length > 0;
  const mapHeight = 'h-80 md:h-[26rem]';

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text">
        {route
          ? ROUTE_RENDERING_TERMS.sectionTitle
          : ROUTE_RENDERING_TERMS.startLocationTitle}
      </h2>
      <Card className="overflow-hidden p-0">
        <div
          className={
            hasSideColumn
              ? 'flex flex-col md:grid md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]'
              : 'flex flex-col'
          }
        >
          {hasSideColumn && (
            // Map first on mobile (it's the panel's point), list first — as a
            // left rail — from `md` up.
            <div className="order-2 border-t border-border p-5 md:order-1 md:max-h-[26rem] md:overflow-y-auto md:border-t-0 md:border-r">
              <StopList stops={stops} />
            </div>
          )}
          <div className="order-1 p-2 md:order-2">
            {status === 'loading' && (
              <Skeleton className={cn('w-full rounded-lg', mapHeight)} />
            )}
            {status === 'error' && <RouteMapPlaceholder />}
            {status === 'ready' && (
              <RouteMap
                geometry={points}
                routePoints={routePoints}
                stops={stops}
                start={start}
                className={mapHeight}
              />
            )}
          </div>
        </div>
        {route && (
          <div className="flex flex-col gap-2 border-t border-border p-5">
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
        )}
      </Card>
    </section>
  );
}

/**
 * One label/value line of the summary panel's secondary facts (difficulty,
 * bike type, price, participants) — quieter than a `MetricTile`, the way a
 * ride's headline numbers and its supporting details differ in weight. Value
 * and unit stay separate spans, same unit-is-quieter rule as `MetricTile`
 * (`docs/design.md` §6).
 */
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 sm:justify-start">
      <dt className="text-sm text-text-secondary sm:w-40 sm:shrink-0">
        {label}
      </dt>
      <dd className="text-right text-sm font-semibold text-text tabular-nums sm:text-left">
        {children}
      </dd>
    </div>
  );
}

function FactValue({ value, unit }: { value: string; unit: string }) {
  return (
    <>
      <span>{value}</span>
      {unit ? (
        <span className="ml-1 font-normal text-text-secondary">{unit}</span>
      ) : null}
    </>
  );
}

/**
 * CR-042 ("Review"): the "Отзывы" section, shown only once the ride is `finished`
 * (`.claude/context/current-task.md`'s scope decision — reviews can't exist before
 * then, `apps/api`'s `createReview` already enforces it server-side). `ReviewForm`
 * renders only for a viewer who both has an active registration and hasn't already
 * reviewed — its absence is the "you can't/already did" signal, no separate copy.
 */
function ReviewsSection({
  rideId,
  canReview,
  onSubmitted,
}: {
  rideId: string;
  canReview: boolean;
  onSubmitted: (review: Review) => void;
}) {
  const [status, setStatus] = useState<ReviewListStatus>('loading');
  const [reviews, setReviews] = useState<Review[]>([]);

  function loadReviews() {
    setStatus('loading');
    getRideReviews(rideId)
      .then((response) => {
        setReviews(response.items);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }

  useEffect(() => {
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text">
        {REVIEWS_TERMS.sectionTitle}
      </h2>
      {canReview && (
        <ReviewForm
          rideId={rideId}
          onSubmitted={(review) => {
            onSubmitted(review);
            loadReviews();
          }}
        />
      )}
      <ReviewList status={status} reviews={reviews} onRetry={loadReviews} />
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
export function RideDetailView({
  rideId,
  stickyRegistrationCta = false,
  coverGlassPanel = false,
}: {
  rideId: string;
  stickyRegistrationCta?: boolean;
  coverGlassPanel?: boolean;
}) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [ride, setRide] = useState<Ride | null>(null);
  const [organizerName, setOrganizerName] = useState<string>('');
  const [organizerRating, setOrganizerRating] = useState<number | null>(null);
  const [organizerReviewCount, setOrganizerReviewCount] = useState(0);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [registrationsCount, setRegistrationsCount] = useState(0);
  const [viewerRegistration, setViewerRegistration] =
    useState<Registration | null>(null);
  const [viewerWaitlistEntry, setViewerWaitlistEntry] =
    useState<WaitlistEntry | null>(null);
  const [viewerReview, setViewerReview] = useState<Review | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getRideDetail(rideId)
      .then((response) => {
        if (cancelled) return;
        setRide(response.ride);
        setOrganizerName(response.organizer.name);
        setOrganizerRating(response.organizer.rating);
        setOrganizerReviewCount(response.organizer.reviewCount);
        setRoute(response.route);
        setStops(response.stops);
        setRoutePoints(response.routePoints);
        setRegistrationsCount(response.registrationsCount);
        setViewerRegistration(response.viewerRegistration);
        setViewerWaitlistEntry(response.viewerWaitlistEntry);
        setViewerReview(response.viewerReview);
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
  }, [rideId, loadAttempt]);

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
    return (
      <ErrorState
        message={RIDE_DETAIL_TERMS.loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
      />
    );
  }

  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startDate = new Date(ride.startsAt);
  const start =
    ride.startLat !== null && ride.startLng !== null
      ? { lat: ride.startLat, lng: ride.startLng }
      : null;
  const hasMapContent =
    route !== null ||
    stops.length > 0 ||
    routePoints.length > 0 ||
    start !== null;
  const hasHeadlineMetrics =
    ride.distanceKm !== null ||
    ride.elevationGainMeters !== null ||
    ride.durationMinutes !== null ||
    ride.paceKmh !== null;

  return (
    <div className="flex flex-col gap-8">
      {ride.coverImageUrl ? (
        // ADR-019/CR-086: `coverImageUrl` is the API's bare `/v1/...` path
        // (ADR-011) — `apiAssetUrl` adds the `/api` same-origin rewrite prefix.
        // Same-origin either way, so no `images.remotePatterns` entry needed.
        <div className="relative h-64 w-full overflow-hidden rounded-xl">
          <Image
            src={apiAssetUrl(ride.coverImageUrl)}
            alt=""
            fill
            className="object-cover"
          />
          {coverGlassPanel && (
            // CR-107 ("Quiet Instrument"): status-only glass panel over the
            // photo — the full title stays the page's `<h1>` below rather
            // than duplicating it, unlike the more compact `RideCard`.
            <div className="absolute top-3 left-3 rounded-md bg-scrim p-1">
              <div
                className={cn(GLASS_PANEL_CLASSNAME, 'rounded-md px-3 py-1.5')}
              >
                <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Summary panel: identity (when, what, who) on the left, the ride's
          numbers on the right, split by a hairline at `lg` — one scannable
          block instead of a long single column of equally loud tiles.
          Headline metrics (distance/elevation/duration/pace) keep the big
          `MetricTile` treatment; supporting facts drop to quieter label/value
          rows. Stacks to one column below `lg`. */}
      <Card className="p-0">
        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-4 p-6">
            {!(coverGlassPanel && ride.coverImageUrl) && (
              <div className="flex items-center gap-3">
                <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary tabular-nums">
                <span className="sr-only">
                  {RIDE_DETAIL_TERMS.startLabel}:{' '}
                </span>
                {formatDate(startDate, { timeZone: ride.startTimezone })}
                {', '}
                {formatTime(startDate, { timeZone: ride.startTimezone })}
              </p>
              <h1 className="text-2xl leading-tight font-semibold text-balance text-text md:text-3xl">
                {ride.title}
              </h1>
              <p className="text-sm text-text-secondary">
                {RIDE_DETAIL_TERMS.organizedByLabel}: {organizerName}
                {organizerReviewCount > 0 && (
                  <>
                    {' · '}
                    {formatRating(organizerRating, organizerReviewCount)}{' '}
                    {RIDE_DETAIL_TERMS.ratingReviewsCount(organizerReviewCount)}
                  </>
                )}
              </p>
            </div>
            {ride.description && (
              <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-text">
                {ride.description}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-5 border-t border-border p-6 lg:border-t-0 lg:border-l">
            {hasHeadlineMetrics && (
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
            )}

            <dl
              className={cn(
                'flex flex-col divide-y divide-border',
                hasHeadlineMetrics && 'border-t border-border',
              )}
            >
              {ride.difficulty !== null && (
                <FactRow label={METRIC_TERMS.difficulty}>
                  <DifficultyScale level={ride.difficulty} />
                </FactRow>
              )}
              <FactRow label={RIDE_DETAIL_TERMS.bicycleTypeLabel}>
                {BICYCLE_TYPE_TERMS[ride.bicycleType]}
              </FactRow>
              <FactRow label={RIDE_DETAIL_TERMS.priceLabel}>
                <FactValue {...formatPriceParts(ride.priceRub)} />
              </FactRow>
              {ride.participantLimit !== null && (
                <FactRow label={METRIC_TERMS.participants}>
                  <FactValue
                    {...formatParticipantsParts(
                      registrationsCount,
                      ride.participantLimit,
                    )}
                  />
                </FactRow>
              )}
            </dl>
            {/* CR-105: same single `RegistrationButton` instance, just repositioned
                below `md` when the flag is on — a fixed bottom bar instead of a
                second mounted instance, so there's no
                duplicate pending/error state or double-submit risk between a mobile
                and desktop copy. Returns `null` itself when no action is possible,
                so the bar simply doesn't appear then. */}
            <div
              className={
                stickyRegistrationCta
                  ? // CR-107 ("Quiet Instrument"): glass treatment on this
                    // surface too (the two the visual direction names) —
                    // `GLASS_PANEL_CLASSNAME` supplies the border on every
                    // side, so the old `border-t border-border` is dropped
                    // rather than fighting it for the same property.
                    cn(
                      GLASS_PANEL_CLASSNAME,
                      'fixed inset-x-0 bottom-0 z-10 p-4 shadow-overlay md:static md:inset-x-auto md:bottom-auto md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none',
                    )
                  : undefined
              }
            >
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
                  // CR-036 ("Waitlist"): cancelling may have silently promoted the
                  // oldest waiting entry into the freed spot server-side, so the
                  // count might not actually have gone down — refetch instead of
                  // guessing (`.claude/rules/database.md`: "live status, not stale
                  // coordination").
                  getRideDetail(rideId)
                    .then((response) => {
                      setRegistrationsCount(response.registrationsCount);
                      setViewerWaitlistEntry(response.viewerWaitlistEntry);
                    })
                    .catch(() => {
                      // Best-effort refresh only — the cancellation itself already
                      // succeeded; a stale count here is not worth surfacing an
                      // error for.
                    });
                }}
                onWaitlistChange={setViewerWaitlistEntry}
              />
            </div>
          </div>
        </div>
      </Card>

      {hasMapContent && (
        <RoutePanel
          rideId={rideId}
          route={route}
          routePoints={routePoints}
          stops={stops}
          start={start}
        />
      )}

      {ride.status === 'finished' && (
        <ReviewsSection
          rideId={rideId}
          canReview={viewerRegistration !== null && viewerReview === null}
          onSubmitted={setViewerReview}
        />
      )}
    </div>
  );
}
