import Link from 'next/link';
import type { PublicRideListItem } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  DifficultyScale,
  RIDE_DISCOVERY_TERMS,
  StatusBadge,
  cn,
  formatPrice,
  formatRideStartLine,
} from 'ui';
import {
  buildRideCardMetrics,
  discoveryStatusTerm,
  rideCardSeats,
} from '../lib/ride-metrics';
import { RouteCover } from './RouteCover';

// Value and unit never wrap apart (`docs/design.md` §7).
const NBSP = ' ';

const CHIP_CLASSNAME =
  'inline-flex h-7 items-center rounded-full border border-border px-2.5 text-xs whitespace-nowrap text-text-secondary';

// Label + value + one sub line; the no-metrics line gets the same height so
// cards in one grid row keep their seats/chips aligned.
const METRICS_BLOCK_CLASSNAME =
  'min-h-[4.875rem] border-y border-border py-2.5';

const SEATS_BAR_CLASSNAME = {
  low: 'bg-warning-fill',
  full: 'bg-text-muted',
  open: 'bg-brand',
} as const;

/**
 * The discovery grid card (CR-144, «B2», on ADR-024's route cover): the cover
 * shows only the route and the status chip; the facts sit on a plain panel
 * below — date, a title always two lines tall, three labelled metric columns,
 * seats with a fill bar, and bike type/difficulty/price chips.
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
  const metrics = buildRideCardMetrics(ride);
  const seats = rideCardSeats(ride);
  const cancelled = ride.status === 'cancelled';

  return (
    <Link
      href={`/rides/${ride.id}`}
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-bg-raised text-text transition-[border-color,transform] duration-150 hover:border-border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5"
    >
      <RouteCover
        routePreview={ride.routePreview}
        seed={ride.id}
        cancelled={cancelled}
        emptyLabel={RIDE_DISCOVERY_TERMS.routeMissing}
        topLeft={
          <StatusBadge
            label={statusTerm.label}
            tone={statusTerm.tone}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs leading-4 font-semibold',
              // Tinted tones sit on a solid cover-coloured pill so the art
              // can't show through them; `danger` keeps its own solid fill.
              statusTerm.tone !== 'danger' && 'bg-cover-bg/90',
            )}
          />
        }
      />

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-4 sm:px-5">
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

        {metrics ? (
          // CR-152: a mono label may wrap to two lines on a narrow card
          // («НАБОР ВЫСОТЫ») rather than truncate; each metric spans the three
          // shared subgrid rows (label / value / sub), so every value still
          // sits on one line across the columns.
          <dl
            className={cn(
              'grid grid-cols-3 grid-rows-[auto_auto_auto] gap-y-0.5',
              METRICS_BLOCK_CLASSNAME,
            )}
          >
            {metrics.map((metric, index) => (
              <div
                key={metric.key}
                className={cn(
                  'row-span-3 grid min-w-0 grid-rows-subgrid',
                  index > 0 && 'border-l border-border pl-3',
                )}
              >
                <dt className="self-end font-mono text-xs leading-tight font-medium break-words text-text-muted uppercase">
                  {metric.label}
                </dt>
                <dd className="flex items-baseline whitespace-nowrap">
                  <span
                    className={cn(
                      'font-num text-2xl leading-none font-extrabold tabular-nums',
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
                  <dd className="font-mono text-xs leading-4 text-text-muted">
                    {metric.sub}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : (
          <p
            className={cn(
              'flex items-center text-body-sm text-text-muted',
              METRICS_BLOCK_CLASSNAME,
            )}
          >
            {RIDE_DISCOVERY_TERMS.metricsMissing}
          </p>
        )}

        {cancelled ? null : (
          <div className="grid gap-1.5">
            {/* Each half stays on one line; if both don't fit, the note
                moves to its own line whole rather than breaking mid-phrase. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-body-sm font-medium whitespace-nowrap tabular-nums">
                {seats.count}
              </span>
              <span
                className={cn(
                  'text-xs whitespace-nowrap',
                  seats.level === 'low' ? 'text-warning' : 'text-text-muted',
                )}
              >
                {seats.note}
              </span>
            </div>
            {seats.fillPercent !== null ? (
              <div
                aria-hidden="true"
                className="h-1 overflow-hidden rounded-full bg-border"
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    SEATS_BAR_CLASSNAME[seats.level],
                  )}
                  style={{ width: `${seats.fillPercent}%` }}
                />
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <span className={CHIP_CLASSNAME}>
            {BICYCLE_TYPE_TERMS[ride.bicycleType]}
          </span>
          {ride.difficulty !== null ? (
            <span className={CHIP_CLASSNAME}>
              <DifficultyScale level={ride.difficulty} size="sm" />
            </span>
          ) : null}
          <span className={CHIP_CLASSNAME}>{formatPrice(ride.priceRub)}</span>
        </div>
      </div>
    </Link>
  );
}
