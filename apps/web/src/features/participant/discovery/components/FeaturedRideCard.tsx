import Link from 'next/link';
import { useId } from 'react';
import type { PublicRideListItem } from 'types';
import {
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_DISCOVERY_TERMS,
  buttonClassName,
  cn,
  formatDistance,
  formatRideStartLine,
  formatStartPlace,
} from 'ui';
import {
  buildRideCardMetrics,
  discoveryStatusTerm,
  rideCardSeats,
} from '../lib/ride-metrics';
import { RideStatusPill } from './RideGridCard';
import { RouteCover } from './RouteCover';
import { SeatsMeter } from './SeatsMeter';

const NBSP = ' ';

const COVER_TAG_CLASSNAME =
  'inline-flex h-8 items-center rounded-full bg-cover-bg/90 px-3 font-mono text-xs whitespace-nowrap text-cover-ink';

/**
 * CR-153 (owner's mockup): the «Ближайший» ride above the grid — the route
 * cover large (left on desktop, on top on a phone), then the date, title,
 * start, the three headline numbers big, seats over a bar and one call to
 * action. `pickFeaturedRide` chooses the ride; it is not repeated in the grid.
 */
export function FeaturedRideCard({ ride }: { ride: PublicRideListItem }) {
  const titleId = useId();
  const statusTerm = discoveryStatusTerm(ride);
  const startLine = formatRideStartLine(new Date(ride.startsAt), {
    timeZone: ride.startTimezone,
  });
  const metrics = buildRideCardMetrics(ride);
  const seats = rideCardSeats(ride);
  const cancelled = ride.status === 'cancelled';
  // KI-060: «Старт» as a label says nothing — fall back to the point's
  // description, same as the legend row and ride detail.
  const startPlace = formatStartPlace(ride.startLabel, ride.startDescription);
  const href = `/rides/${ride.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="grid overflow-hidden rounded-3xl border border-border bg-bg-raised md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
    >
      <RouteCover
        variant="hero"
        routePreview={ride.routePreview}
        seed={ride.id}
        cancelled={cancelled}
        emptyLabel={RIDE_DISCOVERY_TERMS.routeMissing}
        topLeft={<RideStatusPill {...statusTerm} />}
        bottomLeft={
          ride.distanceKm !== null ? (
            <span className={COVER_TAG_CLASSNAME}>
              {formatDistance(ride.distanceKm)}
            </span>
          ) : null
        }
        className="h-52 md:h-auto md:min-h-95"
      />

      <div className="flex flex-col gap-4 p-5 md:p-8">
        <div className="grid gap-2">
          <p className="font-mono text-label text-primary uppercase">
            {RIDE_DISCOVERY_TERMS.featuredLabel}
          </p>
          <p className="font-mono text-label text-text-secondary uppercase tabular-nums">
            {startLine}
          </p>
          <h2
            id={titleId}
            className={cn(
              'text-h2 wrap-anywhere',
              cancelled
                ? 'text-text-muted line-through decoration-2'
                : 'text-text',
            )}
          >
            {ride.title}
          </h2>
          {startPlace ? (
            <p className="text-body-sm text-text-muted">
              {RIDE_DISCOVERY_ROW_TERMS.startPrefix}: {startPlace}
            </p>
          ) : null}
        </div>

        {metrics ? (
          <dl className="mt-1 grid grid-cols-3 gap-3 md:gap-4">
            {metrics.map((metric) => (
              <div
                key={metric.key}
                className="grid min-w-0 content-start gap-2"
              >
                <dt className="font-mono text-xs leading-tight font-medium break-words text-text-muted uppercase">
                  {metric.label}
                </dt>
                <dd className="flex items-baseline whitespace-nowrap">
                  <span
                    className={cn(
                      'font-num text-metric font-extrabold tabular-nums',
                      metric.missing
                        ? 'text-text-muted'
                        : metric.key === 'elevation'
                          ? 'text-elevation'
                          : 'text-text',
                    )}
                  >
                    {metric.parts.value}
                  </span>
                  {metric.parts.unit ? (
                    <span className="font-mono text-xs text-text-secondary">
                      {NBSP}
                      {metric.parts.unit}
                    </span>
                  ) : null}
                </dd>
                {metric.sub ? (
                  <dd className="font-mono text-xs text-text-muted">
                    {metric.sub}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-body-sm text-text-muted">
            {RIDE_DISCOVERY_TERMS.metricsMissing}
          </p>
        )}

        {cancelled ? null : <SeatsMeter seats={seats} className="md:mt-auto" />}

        {/* The visible text leads the accessible name (WCAG 2.5.3); the ride
            title makes it unique on the page. */}
        <Link
          href={href}
          aria-label={`${RIDE_DISCOVERY_TERMS.featuredCta}: ${ride.title}`}
          className={buttonClassName('primary', 'w-full md:w-fit')}
        >
          {RIDE_DISCOVERY_TERMS.featuredCta}
        </Link>
      </div>
    </article>
  );
}
