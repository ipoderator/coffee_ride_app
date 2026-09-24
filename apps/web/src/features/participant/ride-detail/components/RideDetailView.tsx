'use client';

import { Download } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useEffect, useState } from 'react';
import type {
  Registration,
  Review,
  Ride,
  RideGroupSummary,
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
  formatDistanceParts,
  formatDurationParts,
  formatElevationParts,
  formatPaceRangeParts,
  formatParticipantsParts,
  formatPriceParts,
  formatRating,
  formatRideStartLine,
  formatSpeedParts,
  formatStartPlace,
  METRIC_TERMS,
  MetricRow,
  MetricTile,
  RIDE_DETAIL_GROUP_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_STATUS_TERMS,
  REVIEWS_TERMS,
  ROUTE_RENDERING_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import {
  ApiError,
  getRideDetail,
  getRideReviews,
  routeDownloadUrl,
} from '../api';
import {
  useRouteGeometry,
  type GeometryStatus,
} from '../lib/use-route-geometry';
import { ElevationProfileChart } from './ElevationProfileChart';
import { GroupPicker } from './GroupPicker';
import { RegistrationButton } from './RegistrationButton';
import { ReviewForm } from './ReviewForm';
import { ReviewList, type ReviewListStatus } from './ReviewList';
import { RidersSection } from './RidersSection';
import { RouteLegend } from './RouteLegend';
import { RouteMap } from './RouteMap';
import { RouteMapPlaceholder } from './RouteMapPlaceholder';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

const GROUP_PICKER_ID = 'ride-groups';

// CR-119: the map's footprint — ~300px under the header on a phone, the full
// viewport height (less the header/back-link band) as the sticky left column
// from `lg`. One class list shared by the map, its skeleton and its degraded
// placeholder, so a state change never shifts the layout (§10).
const MAP_SURFACE_CLASSNAME =
  'h-75 rounded-none border-y-[1.5px] border-frame sm:rounded-xl sm:border-[1.5px] lg:h-[calc(100dvh-11rem)] lg:min-h-96';

// `packages/ui`'s `Button` renders a `<button>`; a file download is a link.
// Same classes as its `secondary` variant (`docs/design.md` §5).
const SECONDARY_LINK_CLASSNAME =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-[1.5px] border-frame px-4 text-base font-medium text-text transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-11';

/** Small caps section label in the display face (`docs/design.md` §4). */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-xs font-semibold tracking-[0.06em] text-text-secondary uppercase">
      {children}
    </h2>
  );
}

/**
 * The route map, map-first (CR-119): on a phone it opens the page, from `lg`
 * it is the sticky left column. Shown when the ride has anything to put on a
 * map — an uploaded route, stops, route points, or just a start point.
 */
function MapArea({
  route,
  geometryStatus,
  points,
  routePoints,
  stops,
  start,
}: {
  route: RouteSummary | null;
  geometryStatus: GeometryStatus;
  points: RouteGeometryPoint[];
  routePoints: RoutePoint[];
  stops: Stop[];
  start: { lat: number; lng: number } | null;
}) {
  return (
    <section className="-mx-4 sm:mx-0">
      <h2 className="sr-only">
        {route
          ? ROUTE_RENDERING_TERMS.sectionTitle
          : ROUTE_RENDERING_TERMS.startLocationTitle}
      </h2>
      {geometryStatus === 'loading' && (
        <Skeleton className={cn('w-full', MAP_SURFACE_CLASSNAME)} />
      )}
      {geometryStatus === 'error' && (
        <RouteMapPlaceholder className={MAP_SURFACE_CLASSNAME} />
      )}
      {geometryStatus === 'ready' && (
        <RouteMap
          geometry={points}
          routePoints={routePoints}
          stops={stops}
          start={start}
          className={MAP_SURFACE_CLASSNAME}
        />
      )}
    </section>
  );
}

/** «Профиль высоты» — `elevation` ink (ADR-024, renamed from `contour`), from the shared geometry fetch. */
function ElevationSection({
  status,
  points,
  onRetry,
}: {
  status: GeometryStatus;
  points: RouteGeometryPoint[];
  onRetry: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{ROUTE_RENDERING_TERMS.elevationProfileLabel}</SectionLabel>
      {status === 'loading' && <Skeleton className="h-40 w-full" />}
      {status === 'error' && (
        <ErrorState
          message={ROUTE_RENDERING_TERMS.elevationProfileLoadError}
          tone="warning"
          variant="inline"
          onRetry={onRetry}
        />
      )}
      {status === 'ready' && <ElevationProfileChart points={points} />}
    </section>
  );
}

/**
 * One label/value line of the ride's supporting facts (difficulty, bike type,
 * price, participants) — quieter than a `MetricTile`. Value and unit stay
 * separate spans, same unit-is-quieter rule as `MetricTile` (§6).
 */
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="text-right text-sm font-semibold text-text tabular-nums">
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
 * CR-042 ("Review"): the "Отзывы" section, shown only once the ride is `finished`.
 * `ReviewForm` renders only for a viewer who both has an active registration and
 * hasn't already reviewed — its absence is the "you can't/already did" signal.
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
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-text">
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
    </section>
  );
}

/**
 * `/rides/[id]` (`docs/design.md` §8 "Ride detail", CR-023; rebuilt map-first
 * for «Топокарта» by CR-119). Public — no `CabinetShell`, no session required.
 * `GET /v1/rides/:id` 404s `ride_not_found` for a non-existent id, a `draft` ride,
 * or a `draft` ride belonging to someone else — this view shows the same
 * not-found state for all three, never revealing which.
 *
 * Layout (CR-119): the main path is *see the route → pick a group → register*.
 * - Phone: map first, then the date line / title / organizer / start / metrics
 *   / status, the «Группы» picker, and the registration action as a sticky
 *   bottom bar (CR-105's bar, now the default — its feature flag is removed).
 * - `lg`+: the map is a sticky 7/12 left column; the 5/12 margin panel holds
 *   everything else in the same order, the action sitting in-flow.
 * One `RegistrationButton` instance either way — repositioned by CSS, never
 * mounted twice, so there is no duplicate pending/error state.
 */
export function RideDetailView({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [ride, setRide] = useState<Ride | null>(null);
  const [organizerName, setOrganizerName] = useState<string>('');
  const [organizerRating, setOrganizerRating] = useState<number | null>(null);
  const [organizerReviewCount, setOrganizerReviewCount] = useState(0);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [groups, setGroups] = useState<RideGroupSummary[]>([]);
  const [registrationsCount, setRegistrationsCount] = useState(0);
  const [viewerRegistration, setViewerRegistration] =
    useState<Registration | null>(null);
  const [viewerWaitlistEntry, setViewerWaitlistEntry] =
    useState<WaitlistEntry | null>(null);
  const [viewerReview, setViewerReview] = useState<Review | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [ridersVersion, setRidersVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const geometry = useRouteGeometry(rideId, route?.id ?? null);

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
        setGroups(response.groups);
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

  /**
   * After the viewer's own registration/waitlist/group changes: counts (ride
   * and per-group) and a possible waitlist promotion are server facts, so they
   * are re-read rather than guessed (`.claude/rules/database.md`). Best-effort —
   * the action itself already succeeded; a stale count is not worth an error.
   * The viewer's own registration comes from the action's response, not here.
   */
  function refreshCounts() {
    setRidersVersion((n) => n + 1);
    getRideDetail(rideId)
      .then((response) => {
        setRegistrationsCount(response.registrationsCount);
        setGroups(response.groups);
        setViewerWaitlistEntry(response.viewerWaitlistEntry);
      })
      .catch(() => {});
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-10">
        <Skeleton className="h-75 w-full lg:col-span-7 lg:h-[calc(100dvh-11rem)]" />
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
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
  const startLine = formatRideStartLine(new Date(ride.startsAt), {
    timeZone: ride.startTimezone,
  });
  const start =
    ride.startLat !== null && ride.startLng !== null
      ? { lat: ride.startLat, lng: ride.startLng }
      : null;
  const startRoutePoint = routePoints.find((point) => point.type === 'start');
  const startPointLabel = formatStartPlace(
    startRoutePoint?.label,
    startRoutePoint?.description,
  );
  const hasMapContent =
    route !== null ||
    stops.length > 0 ||
    routePoints.length > 0 ||
    start !== null;
  const hasGroups = groups.length > 0;
  const pace = hasGroups
    ? formatPaceRangeParts(groups.map((group) => group.paceKmh))
    : ride.paceKmh !== null
      ? formatSpeedParts(ride.paceKmh)
      : null;
  const hasHeadlineMetrics =
    ride.distanceKm !== null ||
    ride.elevationGainMeters !== null ||
    ride.durationMinutes !== null ||
    pace !== null;
  const canPickGroup =
    hasGroups &&
    ride.status === 'registration_open' &&
    !viewerRegistration &&
    !viewerWaitlistEntry;
  // The sticky bar is for the one primary action (register / join the
  // waitlist). A registered or queued viewer's block stays in the flow — a
  // «cancel» control pinned to the screen edge is the opposite of
  // de-emphasized.
  const hasStickyAction =
    ride.status === 'registration_open' &&
    !viewerRegistration &&
    !viewerWaitlistEntry;

  const panel = (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-display text-sm font-semibold tracking-[0.06em] text-text-secondary uppercase tabular-nums">
            <span className="sr-only">{RIDE_DETAIL_TERMS.startLabel}: </span>
            {startLine}
          </p>
          <h1 className="font-display text-3xl leading-tight font-semibold text-balance text-text md:text-4xl">
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
          {startPointLabel && (
            <p className="text-sm text-text">
              <span className="text-text-secondary">
                {RIDE_DETAIL_TERMS.startLabel}:
              </span>{' '}
              {startPointLabel}
            </p>
          )}
        </div>

        {hasHeadlineMetrics && (
          <MetricRow className="grid-cols-2 gap-x-6 border-y border-border py-4 md:grid md:grid-cols-4 md:gap-x-8 lg:grid-cols-2 xl:flex xl:flex-nowrap xl:justify-between xl:gap-x-4">
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
            {pace !== null && (
              <MetricTile label={METRIC_TERMS.pace} {...pace} />
            )}
            {ride.durationMinutes !== null && (
              <MetricTile
                label={METRIC_TERMS.duration}
                {...formatDurationParts(ride.durationMinutes)}
              />
            )}
          </MetricRow>
        )}

        <div className="flex items-center gap-3">
          <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
        </div>
      </header>

      {hasGroups && !viewerRegistration && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="ride-groups-title"
        >
          <h2
            id="ride-groups-title"
            className="font-display text-xl font-semibold text-text"
          >
            {RIDE_DETAIL_GROUP_TERMS.sectionTitle}
          </h2>
          {canPickGroup ? (
            <GroupPicker
              id={GROUP_PICKER_ID}
              groups={groups}
              name="ride-group"
              value={selectedGroupId}
              onChange={setSelectedGroupId}
            />
          ) : (
            <GroupPicker
              groups={groups}
              name="ride-group"
              value={null}
              viewerGroupId={viewerWaitlistEntry?.groupId ?? null}
            />
          )}
        </section>
      )}

      <div
        className={
          hasStickyAction
            ? // CR-105's sticky bar, the default since CR-119: fixed to the
              // bottom edge below `lg` on the `surface` sheet with an ink rule,
              // in-flow in the margin panel from `lg`.
              'fixed inset-x-0 bottom-0 z-20 border-t-[1.5px] border-frame bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-overlay lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none'
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
          groups={groups}
          selectedGroupId={selectedGroupId}
          startLine={startLine}
          startPointLabel={startPointLabel}
          groupPickerId={canPickGroup ? GROUP_PICKER_ID : undefined}
          onChange={(registration) => {
            setViewerRegistration(registration);
            if (registration) {
              setViewerWaitlistEntry(null);
              setSelectedGroupId(null);
            }
            refreshCounts();
          }}
          onWaitlistChange={(entry) => {
            setViewerWaitlistEntry(entry);
            refreshCounts();
          }}
        />
      </div>

      {route && (
        <a
          href={routeDownloadUrl(rideId)}
          download
          className={cn(SECONDARY_LINK_CLASSNAME, 'self-start')}
        >
          <Download className="size-4" aria-hidden="true" />
          {RIDE_DETAIL_REGISTRATION_TERMS.downloadGpx}
        </a>
      )}

      <section className="flex flex-col gap-3">
        <SectionLabel>{RIDE_DETAIL_REGISTRATION_TERMS.aboutTitle}</SectionLabel>
        {ride.coverImageUrl ? (
          // ADR-019/CR-086: `coverImageUrl` is the API's bare `/v1/...` path
          // (ADR-011) — `apiAssetUrl` adds the `/api` same-origin prefix.
          <div className="relative h-48 w-full overflow-hidden rounded-xl">
            <Image
              src={apiAssetUrl(ride.coverImageUrl)}
              alt=""
              fill
              className="object-cover"
            />
          </div>
        ) : null}
        {ride.description && (
          <p className="max-w-prose text-base leading-relaxed whitespace-pre-wrap text-text">
            {ride.description}
          </p>
        )}
        <dl
          data-testid="ride-facts"
          className="flex flex-col divide-y divide-border border-y border-border"
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
      </section>

      <RouteLegend
        routePoints={routePoints}
        stops={stops}
        showRideStart={start !== null && !startRoutePoint}
      />

      {route && (
        <ElevationSection
          status={geometry.status}
          points={geometry.points}
          onRetry={geometry.retry}
        />
      )}

      <RidersSection
        rideId={rideId}
        registrationsCount={registrationsCount}
        groups={groups}
        version={ridersVersion}
      />

      {ride.status === 'finished' && (
        <ReviewsSection
          rideId={rideId}
          canReview={viewerRegistration !== null && viewerReview === null}
          onSubmitted={setViewerReview}
        />
      )}

      {hasStickyAction && (
        // Spacer so the fixed bar never covers the end of the page.
        <div aria-hidden className="h-36 lg:hidden" />
      )}
    </div>
  );

  if (!hasMapContent) {
    return <div className="mx-auto w-full max-w-2xl">{panel}</div>;
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10">
      <div className="lg:sticky lg:top-6 lg:col-span-7">
        <MapArea
          route={route}
          geometryStatus={geometry.status}
          points={geometry.points}
          routePoints={routePoints}
          stops={stops}
          start={start}
        />
      </div>
      <div className="lg:col-span-5">{panel}</div>
    </div>
  );
}
