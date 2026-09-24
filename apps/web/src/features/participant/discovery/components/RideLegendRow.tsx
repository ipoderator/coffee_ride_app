import Link from 'next/link';
import type { Ref } from 'react';
import type { PublicRideListItem } from 'types';
import {
  DIFFICULTY_LEVEL_TERMS,
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_STATUS_TERMS,
  StatusBadge,
  cn,
  formatPrice,
  formatRideStartLine,
  formatStartPlace,
} from 'ui';
import { buildRideRowMetrics, ridesSeatsLabel } from '../lib/ride-metrics';
import { RoutePreviewGlyph } from './RoutePreviewGlyph';

// Value and unit never wrap apart (`docs/design.md` §7).
const NBSP = '\u00a0';

const CHIP_CLASSNAME =
  'inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs leading-5 font-medium text-text-secondary';

/**
 * `/`'s ride row (CR-118, ADR-021 «Топокарта»): a map-legend entry, not a card —
 * no fill, hairline-separated, the route glyph as its key symbol. The title is
 * a real link to `/rides/[id]` whose hit area is stretched over the whole row
 * (`after:inset-0`), so the row is one tab stop and one click target.
 *
 * Selection is driven by the parent: hovering the row or focusing its link
 * (keyboard) reports the ride; `active` paints the selected state — the
 * `primary-tint` sheet plus a 3px overprint bar, never colour alone (the map
 * shows the same ride's route at the same time).
 */
export function RideLegendRow({
  ride,
  active = false,
  onHoverChange,
  onFocus,
  rowRef,
  compact = false,
  className,
}: {
  ride: PublicRideListItem;
  active?: boolean;
  /** The phone's raised copy over the map strip: when, title and metrics
   * only, so it covers as little of the map as possible. */
  compact?: boolean;
  onHoverChange?: (rideId: string | null) => void;
  onFocus?: (rideId: string) => void;
  rowRef?: Ref<HTMLLIElement>;
  className?: string;
}) {
  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startLine = formatRideStartLine(new Date(ride.startsAt), {
    timeZone: ride.startTimezone,
  });
  const metrics = buildRideRowMetrics(ride);
  const seats = ridesSeatsLabel(ride);
  const startPlace = formatStartPlace(ride.startLabel);
  const startText = [
    startPlace
      ? `${RIDE_DISCOVERY_ROW_TERMS.startPrefix}: ${startPlace}`
      : null,
    ride.organizer.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      ref={rowRef}
      data-ride-id={ride.id}
      data-active={active ? 'true' : 'false'}
      onMouseEnter={onHoverChange ? () => onHoverChange(ride.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      className={cn(
        'relative flex gap-3 border-b border-border px-4 py-4 lg:px-6',
        active && 'bg-primary-tint',
        className,
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-primary"
        />
      ) : null}

      <div className="flex w-10 shrink-0 justify-center pt-1">
        <RoutePreviewGlyph routePreview={ride.routePreview} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Date line and status share one line: status is the same for most
            rows ("Регистрация открыта"), so it sits beside the when, not in the
            chip row where it would crowd the facts that differ per ride. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="font-display text-xs leading-4 font-semibold tracking-[0.06em] text-text-secondary uppercase tabular-nums">
            {startLine}
          </p>
          <StatusBadge
            label={statusTerm.label}
            tone={statusTerm.tone}
            className="px-1.5 py-0.5 text-xs leading-4"
          />
        </div>

        <h2 className="font-sans text-xl leading-tight font-semibold">
          <Link
            href={`/rides/${ride.id}`}
            onFocus={onFocus ? () => onFocus(ride.id) : undefined}
            className={cn(
              compact ? 'line-clamp-1' : 'line-clamp-2',
              'rounded-sm text-text after:absolute after:inset-0 hover:underline hover:decoration-1 hover:underline-offset-4',
            )}
          >
            {ride.title}
          </Link>
        </h2>

        {startText && !compact ? (
          <p className="truncate text-sm text-text-secondary">{startText}</p>
        ) : null}

        {metrics.length > 0 ? (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-lg leading-6 font-semibold text-text tabular-nums">
            {metrics.map((metric, index) => (
              <span key={metric.key} className="inline-flex items-baseline">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="mr-2 font-normal text-text-muted"
                  >
                    ·
                  </span>
                ) : null}
                <span className={metric.className}>{metric.parts.value}</span>
                {metric.parts.unit ? (
                  <span className="text-sm font-normal text-text-secondary">
                    {NBSP}
                    {metric.parts.unit}
                  </span>
                ) : null}
                {metric.suffix ? (
                  <span className="ml-2 text-sm font-normal text-text-secondary">
                    {`· ${metric.suffix}`}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}

        {compact ? null : (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {seats ? (
              <span
                className={cn(
                  CHIP_CLASSNAME,
                  ride.participantLimit !== null &&
                    ride.registrationsCount >= ride.participantLimit &&
                    'border-warning/40 text-warning',
                )}
              >
                {seats}
              </span>
            ) : null}
            {ride.difficulty !== null ? (
              <span className={CHIP_CLASSNAME}>
                {DIFFICULTY_LEVEL_TERMS[ride.difficulty]}
              </span>
            ) : null}
            <span className={CHIP_CLASSNAME}>{formatPrice(ride.priceRub)}</span>
          </div>
        )}
      </div>
    </li>
  );
}
