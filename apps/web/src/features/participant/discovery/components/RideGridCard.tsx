import { RouteOff } from 'lucide-react';
import Link from 'next/link';
import type { PublicRideListItem } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  DIFFICULTY_LEVEL_TERMS,
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_DISCOVERY_TERMS,
  StatusBadge,
  cn,
  formatPrice,
  formatRideStartLine,
} from 'ui';
import {
  buildRideRowMetrics,
  discoveryStatusTerm,
  rideCardSeats,
} from '../lib/ride-metrics';
import { RouteCover } from './RouteCover';
import { SeatsMeter } from './SeatsMeter';

// Value and unit never wrap apart (`docs/design.md` §7).
const NBSP = '\u00A0';

const TAG_CLASSNAME =
  'inline-flex h-8 items-center rounded-full border border-border px-3 text-body-sm whitespace-nowrap text-text-secondary';

/**
 * The discovery grid card. CR-144 («B2») put the facts on a plain panel under
 * ADR-024's route cover; CR-153 (owner's mockup) makes it compact: date,
 * title, the three headline numbers in one line («32 км 120 м 18 км/ч», a
 * missing one left out, never `0`), seats «4 из 10 · Осталось 6 мест» over a
 * bar, and tags — bike type, difficulty, pace groups, price.
 *
 * CR-185 (UX handoff P2): a ride without a drawn route gets no cover at all
 * — a compact head (status + an explicit «Маршрут пока не загружен») instead
 * of a full-height empty contour panel.
 *
 * CR-193: no seats block on a started, finished or cancelled ride
 * (`rideCardSeats` → `null`) — only the status chip, never «Осталось N мест».
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
  const metrics = buildRideRowMetrics(ride);
  const seats = rideCardSeats(ride, { short: true });
  const cancelled = ride.status === 'cancelled';
  const hasRoute = (ride.routePreview?.length ?? 0) >= 2;

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-bg-raised text-text transition-[border-color,transform] duration-150 hover:border-border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5"
    >
      {hasRoute ? (
        <RouteCover
          routePreview={ride.routePreview}
          seed={ride.id}
          cancelled={cancelled}
          topLeft={<RideStatusPill {...statusTerm} />}
        />
      ) : (
        <div
          data-route-missing
          className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5"
        >
          <StatusBadge
            label={statusTerm.label}
            tone={statusTerm.tone}
            className="rounded-full px-3 py-1.5 text-xs leading-4 font-semibold"
          />
          <span className="inline-flex items-center gap-1.5 text-body-sm text-text-muted">
            <RouteOff className="size-4" aria-hidden="true" />
            {RIDE_DISCOVERY_TERMS.routeMissing}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="grid gap-1.5">
          <p className="font-mono text-label text-text-secondary uppercase tabular-nums">
            {startLine}
          </p>
          <h3
            className={cn(
              'line-clamp-2 min-h-[2lh] text-h3 wrap-anywhere',
              cancelled
                ? 'text-text-muted line-through decoration-2'
                : 'text-text',
            )}
          >
            {ride.title}
          </h3>
        </div>

        {metrics.length > 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {metrics.map((metric) => (
              <span key={metric.key} className="whitespace-nowrap">
                <span
                  className={cn(
                    'text-body font-semibold tabular-nums',
                    metric.className ?? 'text-text',
                  )}
                >
                  {metric.parts.value}
                </span>
                {metric.parts.unit ? (
                  <span className="font-mono text-xs font-normal text-text-muted">
                    {NBSP}
                    {metric.parts.unit}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        ) : (
          <p className="text-body-sm text-text-muted">
            {RIDE_DISCOVERY_TERMS.metricsMissing}
          </p>
        )}

        {seats ? <SeatsMeter seats={seats} className="mt-1" /> : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <span className={TAG_CLASSNAME}>
            {BICYCLE_TYPE_TERMS[ride.bicycleType]}
          </span>
          {ride.difficulty !== null ? (
            <span className={TAG_CLASSNAME}>
              {DIFFICULTY_LEVEL_TERMS[ride.difficulty]}
            </span>
          ) : null}
          {ride.groups.length >= 2 ? (
            <span className={TAG_CLASSNAME}>
              {RIDE_DISCOVERY_ROW_TERMS.groupsCount(ride.groups.length)}
            </span>
          ) : null}
          <span className={TAG_CLASSNAME}>{formatPrice(ride.priceRub)}</span>
        </div>
      </div>
    </Link>
  );
}

/** The status chip on a dark route cover (both cards). */
export function RideStatusPill({
  label,
  tone,
}: ReturnType<typeof discoveryStatusTerm>) {
  return (
    <StatusBadge
      label={label}
      tone={tone}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs leading-4 font-semibold',
        // Tinted tones sit on a solid cover-coloured pill so the art can't
        // show through them; `danger` keeps its own solid fill.
        tone !== 'danger' && 'bg-cover-bg/90',
      )}
    />
  );
}
