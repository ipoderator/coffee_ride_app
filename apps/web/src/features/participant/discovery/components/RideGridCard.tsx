import Link from 'next/link';
import type { PublicRideListItem } from 'types';
import { StatusBadge, formatRideStartLine } from 'ui';
import {
  buildRideRowMetrics,
  discoveryStatusTerm,
  ridesSeatsLabel,
} from '../lib/ride-metrics';
import { RouteCover } from './RouteCover';

// Value and unit never wrap apart (`docs/design.md` §7).
const NBSP = ' ';

/**
 * ADR-024's discovery grid card: a `RouteCover` with the status chip, date/
 * title/headline metrics and seats-left composed on top — the card-grid
 * counterpart to `RideLegendRow`'s hairline row, sharing the same metric/
 * status derivation (`../lib/ride-metrics.ts`) so the two views never
 * disagree about a ride's numbers.
 *
 * No participant avatars here on purpose: `GET /v1/rides` is fully public
 * (no session), and showing riders' photos/names to an anonymous visitor
 * would leak identity the ride-detail riders list only shows once
 * `participantsVisible`/`profileVisibility` (ADR-023) have been checked.
 */
export function RideGridCard({ ride }: { ride: PublicRideListItem }) {
  const statusTerm = discoveryStatusTerm(ride);
  const startLine = formatRideStartLine(new Date(ride.startsAt), {
    timeZone: ride.startTimezone,
  });
  const metrics = buildRideRowMetrics(ride).slice(0, 3);
  const seats = ridesSeatsLabel(ride);
  const cancelled = ride.status === 'cancelled';

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="block rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <RouteCover
        routePreview={ride.routePreview}
        seed={ride.id}
        cancelled={cancelled}
        topLeft={
          <StatusBadge
            label={statusTerm.label}
            tone={statusTerm.tone}
            className="bg-cover-bg/85 px-2.5 py-1 text-xs leading-4"
          />
        }
      >
        <p className="font-mono text-xs leading-4 font-semibold tracking-[0.06em] text-cover-ink/85 uppercase tabular-nums">
          {startLine}
        </p>
        <h3
          className={
            cancelled
              ? 'font-title text-xl leading-tight font-semibold text-cover-ink line-through decoration-2'
              : 'font-title text-xl leading-tight font-semibold text-cover-ink'
          }
        >
          {ride.title}
        </h3>
        {metrics.length > 0 ? (
          <p className="flex flex-wrap items-baseline gap-x-4 font-num text-2xl leading-none font-extrabold text-cover-ink tabular-nums">
            {metrics.map((metric) => (
              <span key={metric.key} className="inline-flex items-baseline">
                <span
                  className={
                    metric.className === 'text-elevation'
                      ? 'text-cover-elevation'
                      : undefined
                  }
                >
                  {metric.parts.value}
                </span>
                {metric.parts.unit ? (
                  <span className="font-mono text-xs font-normal text-cover-ink/70">
                    {NBSP}
                    {metric.parts.unit}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}
        {!cancelled && seats ? (
          <p className="font-mono text-xs text-cover-ink/70">{seats}</p>
        ) : null}
      </RouteCover>
    </Link>
  );
}
