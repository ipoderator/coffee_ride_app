'use client';

import { Clock, Download, Share2, Star } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GetRideResponse,
  Registration,
  Review,
  WaitlistEntry,
} from 'types';
import {
  Avatar,
  BICYCLE_TYPE_TERMS,
  Button,
  buttonClassName,
  Card,
  cn,
  DifficultyScale,
  ErrorState,
  formatCountdownShort,
  formatDate,
  formatDistanceParts,
  formatDurationParts,
  formatElevationParts,
  formatGroupPaceParts,
  formatPaceRangeParts,
  formatPrice,
  formatRating,
  formatRelativeDay,
  formatRideStartLine,
  formatShortWeekday,
  formatSpeedParts,
  formatStartPlace,
  formatTime,
  METRIC_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_POSTER_TERMS,
  RIDE_TICKET_TERMS,
  REVIEWS_TERMS,
  ROUTE_RENDERING_TERMS,
  Skeleton,
  useToast,
  type MetricParts,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import {
  ApiError,
  getRideDetail,
  getRideReviews,
  routeDownloadUrl,
} from '../api';
import { buildRouteTrack } from '../lib/route-track';
import {
  posterStatusTerm,
  seatsLeftOf,
  ticketStateOf,
  type TicketState,
} from '../lib/ticket-state';
import { buildTimeline } from '../lib/timeline';
import { useRouteGeometry } from '../lib/use-route-geometry';
import { ElevationProfileChart } from './ElevationProfileChart';
import { RegistrationTicket } from './RegistrationTicket';
import { ReviewForm } from './ReviewForm';
import { ReviewList, type ReviewListStatus } from './ReviewList';
import { RideHero, type HeroMetric, type HeroView } from './RideHero';
import { RidersSection } from './RidersSection';
import { RouteMap } from './RouteMap';
import { RouteMapPlaceholder } from './RouteMapPlaceholder';
import { RouteTimeline } from './RouteTimeline';
import { TicketBar, type TicketBarContent } from './TicketBar';
import { TrackCover, type CoverMark } from './TrackCover';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

// The map face fills the hero's picture area exactly (`RideHero`'s
// `h-65 sm:h-80`), so switching faces never shifts the layout (§10).
const MAP_SURFACE_CLASSNAME = 'absolute inset-0 h-full rounded-none';

const CHIP_CLASSNAME =
  'inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-raised px-3 py-1 text-[13px] font-medium whitespace-nowrap text-text-secondary';

const SECTION_TITLE_CLASSNAME =
  'font-title text-lg leading-tight font-medium text-text';

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
      <h2 className={SECTION_TITLE_CLASSNAME}>{REVIEWS_TERMS.sectionTitle}</h2>
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

function Chip({ children }: { children: ReactNode }) {
  return <span className={CHIP_CLASSNAME}>{children}</span>;
}

function metric(
  key: string,
  label: string,
  parts: MetricParts,
  missing: boolean,
  extra: Partial<HeroMetric> = {},
): HeroMetric {
  return { key, label, parts, missing, ...extra };
}

/** The phone bar's content for the ticket's face — `null` where there is
 * nothing to bring the viewer back to. */
function barContent(
  state: TicketState,
  data: {
    place: number;
    waitlistCount: number;
    startNumber: number | null;
    when: string;
    seatsLine: string;
    countdown: string | null;
  },
): TicketBarContent | null {
  switch (state) {
    case 'open':
    case 'few':
      return {
        title: RIDE_TICKET_TERMS.barNumber(data.place),
        subtitle: `${data.when} · ${data.seatsLine}`,
        action: REGISTRATION_ACTION_TERMS.register,
        variant: 'primary',
      };
    case 'full':
      return {
        title: RIDE_TICKET_TERMS.barFull(data.waitlistCount),
        subtitle: data.when,
        action: RIDE_TICKET_TERMS.barQueue,
        variant: 'primary',
      };
    case 'registered':
      return {
        title: RIDE_TICKET_TERMS.barRegistered(data.startNumber),
        subtitle: data.countdown
          ? RIDE_TICKET_TERMS.countdown(data.countdown)
          : data.when,
        action: RIDE_TICKET_TERMS.barDetails,
        variant: 'secondary',
      };
    default:
      return null;
  }
}

/**
 * `/rides/[id]` (`docs/design.md` §8 "Ride detail", CR-023), rebuilt as the
 * «Постер заезда v2» (CR-151). Public — no `CabinetShell`, no session required.
 * `GET /v1/rides/:id` 404s `ride_not_found` for a non-existent id, a `draft`
 * ride, or a `draft` ride belonging to someone else — this view shows the same
 * not-found state for all three, never revealing which.
 *
 * Reading order: date line → title → organizer; the dark hero (track ⇄ 2GIS
 * map, numbers band); then the registration ticket — a sticky right-hand
 * aside from `lg`, straight under the hero on a phone, where a bottom bar
 * appears once it has scrolled away — and the main column: facts and
 * description, «Маршрут по точкам» with the elevation profile (whose pointer
 * moves a dot along the cover's track), GPX/share, «Кто едет», reviews.
 */
export function RideDetailView({ rideId }: { rideId: string }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [detail, setDetail] = useState<GetRideResponse | null>(null);
  const [viewerRegistration, setViewerRegistration] =
    useState<Registration | null>(null);
  const [viewerWaitlistEntry, setViewerWaitlistEntry] =
    useState<WaitlistEntry | null>(null);
  const [viewerReview, setViewerReview] = useState<Review | null>(null);
  const [ridersVersion, setRidersVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [view, setView] = useState<HeroView>('track');
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const ticketRef = useRef<HTMLElement>(null);

  const route = detail?.route ?? null;
  const geometry = useRouteGeometry(rideId, route?.id ?? null);
  const track = useMemo(
    () => buildRouteTrack(geometry.points),
    [geometry.points],
  );

  // Placing each pin along the track scans the whole geometry, so it is
  // computed once per data change — not on every pointer move over the
  // elevation profile (which re-renders this view to move the cover's dot).
  const timeline = useMemo(() => {
    if (!detail) return [];
    const { ride, routePoints, stops } = detail;
    const timeZone = ride.startTimezone;
    const startsAt = new Date(ride.startsAt);
    const rideStart =
      ride.startLat !== null && ride.startLng !== null
        ? { lat: ride.startLat, lng: ride.startLng }
        : null;
    const hasStartPoint = routePoints.some((point) => point.type === 'start');
    return buildTimeline({
      routePoints,
      stops,
      track,
      rideStart: hasStartPoint ? null : rideStart,
      startTime: formatTime(startsAt, { timeZone }),
      finishTime:
        ride.durationMinutes !== null
          ? formatTime(
              new Date(startsAt.getTime() + ride.durationMinutes * 60_000),
              { timeZone },
            )
          : null,
    });
  }, [detail, track]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getRideDetail(rideId)
      .then((response) => {
        if (cancelled) return;
        setDetail(response);
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
   * After the viewer's own registration/waitlist/group changes: counts, the
   * viewer's start number / queue place and a possible waitlist promotion are
   * server facts, so they are re-read rather than guessed
   * (`.claude/rules/database.md`). Best-effort — the action itself already
   * succeeded; a stale count is not worth an error.
   */
  function refreshCounts() {
    setRidersVersion((n) => n + 1);
    getRideDetail(rideId)
      .then((response) => {
        setDetail((current) =>
          current
            ? {
                ...current,
                registrationsCount: response.registrationsCount,
                groups: response.groups,
                waitlistCount: response.waitlistCount,
                viewerStartNumber: response.viewerStartNumber,
                viewerWaitlistPosition: response.viewerWaitlistPosition,
              }
            : current,
        );
        setViewerWaitlistEntry(response.viewerWaitlistEntry);
      })
      .catch(() => {});
  }

  async function shareRide() {
    const url = window.location.href;
    const title = detail?.ride.title ?? '';
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(RIDE_POSTER_TERMS.shareCopied);
    } catch (error) {
      // The viewer closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast(RIDE_POSTER_TERMS.shareFailed);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-5" data-testid="ride-detail-loading">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-12 w-full max-w-xl" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="-mx-4 h-100 rounded-none sm:mx-0 sm:h-110 sm:rounded-[28px]" />
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          <Skeleton className="h-40 w-full lg:col-start-2 lg:row-start-1 lg:h-96" />
          <Skeleton className="h-40 w-full lg:col-start-1 lg:row-start-1" />
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

  if (status === 'error' || !detail) {
    return (
      <ErrorState
        message={RIDE_DETAIL_TERMS.loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
      />
    );
  }

  const {
    ride,
    organizer,
    stops,
    routePoints,
    groups,
    registrationsCount,
    waitlistCount,
    viewerStartNumber,
    viewerWaitlistPosition,
  } = detail;
  const timeZone = ride.startTimezone;
  const startsAt = new Date(ride.startsAt);
  const startLine = formatRideStartLine(startsAt, { timeZone });
  const startTime = formatTime(startsAt, { timeZone });
  const dateLabel = `${formatShortWeekday(startsAt, { timeZone })} ${formatDate(startsAt, { timeZone })}`;
  const cancelled = ride.status === 'cancelled';
  const upcoming =
    ride.status !== 'cancelled' &&
    ride.status !== 'started' &&
    ride.status !== 'finished';
  const relativeDay = upcoming
    ? formatRelativeDay(startsAt, new Date(), { timeZone })
    : null;

  const rideStart =
    ride.startLat !== null && ride.startLng !== null
      ? { lat: ride.startLat, lng: ride.startLng }
      : null;
  const startRoutePoint = routePoints.find((point) => point.type === 'start');
  const startPointLabel = formatStartPlace(
    startRoutePoint?.label,
    startRoutePoint?.description,
  );
  const showRideStartMark = rideStart !== null && !startRoutePoint;
  const coverMarks: CoverMark[] = [
    ...(showRideStartMark && rideStart
      ? [{ id: 'ride-start', point: rideStart, kind: 'ride-start' as const }]
      : []),
    ...routePoints.map((point) => ({
      id: point.id,
      point: { lat: point.lat, lng: point.lng },
      kind: point.type,
    })),
    ...stops.map((stop) => ({
      id: stop.id,
      point: { lat: stop.lat, lng: stop.lng },
      kind: 'named-stop' as const,
    })),
  ];
  const hasMapContent = route !== null || coverMarks.length > 0;

  const seatsLeft = seatsLeftOf(ride.participantLimit, registrationsCount);
  const ticketState = ticketStateOf({
    rideStatus: ride.status,
    seatsLeft,
    isRegistered: viewerRegistration !== null,
    isWaitlisted: viewerWaitlistEntry !== null,
  });

  const distanceKm = ride.distanceKm ?? route?.distanceKm ?? null;
  const elevationGain =
    ride.elevationGainMeters ?? route?.elevationGainMeters ?? null;
  const pace: { parts: MetricParts; note?: string } | null =
    groups.length >= 2
      ? {
          parts: formatPaceRangeParts(groups.map((group) => group.paceKmh)),
          note: RIDE_DISCOVERY_ROW_TERMS.groupsCount(groups.length),
        }
      : groups.length === 1
        ? { parts: formatGroupPaceParts(groups[0]!.paceKmh) }
        : ride.paceKmh !== null
          ? { parts: formatSpeedParts(ride.paceKmh) }
          : null;
  const metrics: HeroMetric[] = [
    metric(
      'distance',
      METRIC_TERMS.distance,
      formatDistanceParts(distanceKm),
      distanceKm === null,
    ),
    metric(
      'elevation',
      METRIC_TERMS.elevation,
      formatElevationParts(elevationGain),
      elevationGain === null,
      { tone: 'elevation' },
    ),
    metric(
      'pace',
      METRIC_TERMS.pace,
      pace?.parts ?? formatSpeedParts(null),
      pace === null,
      { note: pace?.note },
    ),
    metric(
      'duration',
      METRIC_TERMS.duration,
      formatDurationParts(ride.durationMinutes),
      ride.durationMinutes === null,
    ),
  ];

  const coverLabel = track
    ? RIDE_POSTER_TERMS.trackLabel
    : RIDE_POSTER_TERMS.pointsOnlyLabel;
  const trackFace =
    route && geometry.status === 'loading' ? (
      <Skeleton className="absolute inset-0 rounded-none bg-cover-line" />
    ) : (
      <TrackCover
        track={track}
        marks={coverMarks}
        hoverKm={hoverKm}
        seed={ride.id}
        cancelled={cancelled}
        label={coverLabel}
      />
    );
  const mapFace =
    geometry.status === 'loading' ? (
      <Skeleton className="absolute inset-0 rounded-none" />
    ) : geometry.status === 'error' ? (
      <RouteMapPlaceholder className={MAP_SURFACE_CLASSNAME} />
    ) : (
      <RouteMap
        geometry={geometry.points}
        routePoints={routePoints}
        stops={stops}
        start={rideStart}
        className={MAP_SURFACE_CLASSNAME}
      />
    );

  const seatsLine =
    seatsLeft === null
      ? RIDE_TICKET_TERMS.noLimit.toLowerCase()
      : seatsLeft > 0
        ? RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(seatsLeft).toLowerCase()
        : '';
  const bar = barContent(ticketState, {
    place: registrationsCount + 1,
    waitlistCount,
    startNumber: viewerStartNumber,
    when: `${dateLabel} · ${startTime}`,
    seatsLine,
    countdown: upcoming ? formatCountdownShort(startsAt, new Date()) : null,
  });

  return (
    <div className="mx-auto flex w-full max-w-310 flex-col">
      <header className="flex flex-col gap-3.5 pt-1.5 pb-5.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="font-display text-sm font-semibold tracking-[0.06em] text-text-secondary uppercase tabular-nums">
            <span className="sr-only">{RIDE_DETAIL_TERMS.startLabel}: </span>
            {startLine}
          </p>
          {relativeDay ? (
            <span className={cn(CHIP_CLASSNAME, 'px-2.5 py-0.5')}>
              <Clock className="size-3.5" aria-hidden="true" />
              {relativeDay}
            </span>
          ) : null}
        </div>
        <h1
          className={cn(
            'max-w-[17ch] font-title text-[clamp(30px,5.2vw,58px)] leading-[1.08] font-bold tracking-[-0.015em] text-balance',
            cancelled ? 'text-text-muted' : 'text-text',
          )}
        >
          {ride.title}
        </h1>
        <div className="flex items-center gap-2.5">
          <Avatar
            src={organizer.avatarUrl ? apiAssetUrl(organizer.avatarUrl) : null}
            name={organizer.name}
            size="sm"
            className="h-9 w-9 bg-primary-tint text-sm font-semibold text-primary"
          />
          <p className="text-sm">
            <span className="text-text-secondary">
              {RIDE_POSTER_TERMS.organizedBy}
            </span>{' '}
            <span className="font-semibold text-text">{organizer.name}</span>
            {organizer.reviewCount > 0 ? (
              <span className="text-text-secondary">
                {' · '}
                <Star
                  className="inline size-3.5 fill-elevation stroke-none align-[-2px]"
                  aria-hidden="true"
                />{' '}
                {formatRating(organizer.rating, organizer.reviewCount)}
                {' · '}
                {RIDE_DETAIL_TERMS.ratingReviewsCount(organizer.reviewCount)}
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <RideHero
        view={view}
        onViewChange={setView}
        canShowMap={hasMapContent}
        statusTerm={posterStatusTerm(ride.status, seatsLeft)}
        track={trackFace}
        map={mapFace}
        caption={route ? null : RIDE_POSTER_TERMS.routeMissing}
        metrics={metrics}
      />

      <div className="mt-6 flex flex-col gap-7 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-14">
        <aside
          ref={ticketRef}
          aria-labelledby="ride-ticket-title"
          className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
        >
          <h2 id="ride-ticket-title" className="sr-only">
            {RIDE_TICKET_TERMS.title}
          </h2>
          <RegistrationTicket
            rideId={rideId}
            rideStatus={ride.status}
            state={ticketState}
            participantLimit={ride.participantLimit}
            registrationsCount={registrationsCount}
            waitlistCount={waitlistCount}
            viewerRegistration={viewerRegistration}
            viewerWaitlistEntry={viewerWaitlistEntry}
            viewerStartNumber={viewerStartNumber}
            viewerWaitlistPosition={viewerWaitlistPosition}
            groups={groups}
            dateLabel={dateLabel}
            timeLabel={startTime}
            startsAt={ride.startsAt}
            priceRub={ride.priceRub}
            startPointLabel={startPointLabel}
            onShare={() => void shareRide()}
            onChange={(registration) => {
              setViewerRegistration(registration);
              if (registration) setViewerWaitlistEntry(null);
              refreshCounts();
            }}
            onWaitlistChange={(entry) => {
              setViewerWaitlistEntry(entry);
              refreshCounts();
            }}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1">
          <section className="flex flex-col gap-3.5" data-testid="ride-facts">
            <h2 className="sr-only">
              {RIDE_DETAIL_REGISTRATION_TERMS.aboutTitle}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {ride.difficulty !== null ? (
                <Chip>
                  <span className="sr-only">{METRIC_TERMS.difficulty}: </span>
                  <DifficultyScale level={ride.difficulty} size="sm" />
                </Chip>
              ) : null}
              <Chip>
                <span className="sr-only">
                  {RIDE_DETAIL_TERMS.bicycleTypeLabel}:{' '}
                </span>
                {BICYCLE_TYPE_TERMS[ride.bicycleType]}
              </Chip>
              <Chip>
                <span className="sr-only">
                  {RIDE_DETAIL_TERMS.priceLabel}:{' '}
                </span>
                {formatPrice(ride.priceRub)}
              </Chip>
            </div>
            {ride.coverImageUrl ? (
              // ADR-019/CR-086: `coverImageUrl` is the API's bare `/v1/...` path
              // (ADR-011) — `apiAssetUrl` adds the `/api` same-origin prefix.
              <div className="relative h-56 w-full overflow-hidden rounded-2xl">
                <Image
                  src={apiAssetUrl(ride.coverImageUrl)}
                  alt=""
                  fill
                  className="object-cover"
                />
              </div>
            ) : null}
            {ride.description ? (
              <p className="max-w-[62ch] text-[17px] leading-relaxed whitespace-pre-wrap text-text">
                {ride.description}
              </p>
            ) : null}
          </section>

          {(timeline.length > 0 || route) && (
            <section
              className="flex flex-col gap-3.5"
              aria-labelledby="ride-route-title"
            >
              <h2 id="ride-route-title" className={SECTION_TITLE_CLASSNAME}>
                {RIDE_POSTER_TERMS.timelineTitle}
              </h2>
              <RouteTimeline items={timeline} />
              {route && geometry.status === 'loading' ? (
                <Skeleton className="h-40 w-full" />
              ) : null}
              {route && geometry.status === 'error' ? (
                <ErrorState
                  message={ROUTE_RENDERING_TERMS.elevationProfileLoadError}
                  tone="warning"
                  variant="inline"
                  onRetry={geometry.retry}
                />
              ) : null}
              {track ? (
                <ElevationProfileChart
                  track={track}
                  label={ROUTE_RENDERING_TERMS.elevationProfileLabel}
                  onHoverKm={setHoverKm}
                />
              ) : null}
              {route ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={routeDownloadUrl(rideId)}
                    download
                    className={buttonClassName('secondary')}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {RIDE_DETAIL_REGISTRATION_TERMS.downloadGpx}
                  </a>
                  <Button
                    variant="secondary"
                    className="border-0 px-3 text-sm text-text-secondary hover:text-text"
                    onClick={() => void shareRide()}
                  >
                    <Share2 className="size-4" aria-hidden="true" />
                    {RIDE_POSTER_TERMS.share}
                  </Button>
                </div>
              ) : null}
            </section>
          )}

          {!cancelled && (
            <RidersSection
              rideId={rideId}
              registrationsCount={registrationsCount}
              participantLimit={ride.participantLimit}
              groups={groups}
              version={ridersVersion}
            />
          )}

          {ride.status === 'finished' && (
            <ReviewsSection
              rideId={rideId}
              canReview={viewerRegistration !== null && viewerReview === null}
              onSubmitted={setViewerReview}
            />
          )}

          {bar ? (
            // Room for the phone bar at the very end of the page.
            <div aria-hidden className="h-24 lg:hidden" />
          ) : null}
        </div>
      </div>

      <TicketBar ticketRef={ticketRef} content={bar} />
    </div>
  );
}
