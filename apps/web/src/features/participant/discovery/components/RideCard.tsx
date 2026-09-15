import Link from 'next/link';
import type { PublicRide } from 'types';
import {
  Card,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_DISCOVERY_TERMS,
  RIDE_STATUS_TERMS,
  StatusBadge,
  formatDate,
  formatDistanceParts,
  formatElevationParts,
  formatPriceParts,
  formatSpeedParts,
  formatTime,
} from 'ui';

/**
 * Feature-local, not `packages/ui` (`docs/design.md` §9's component inventory lists
 * `RideCard` under "Feature-local ... not shared"). `docs/design.md` §6: "on a ride
 * card, show the first three" of the canonical distance/elevation/pace/duration
 * order — literally the first three (distance, elevation, pace), not duration; each
 * omitted (never em-dashed) when `null`, same rule `RideDetailView` (CR-023)
 * established. Links into `/rides/[id]` (CR-023).
 */
export function RideCard({ ride }: { ride: PublicRide }) {
  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startDate = new Date(ride.startsAt);

  return (
    <Link href={`/rides/${ride.id}`}>
      <Card className="flex flex-col gap-3 transition-opacity hover:opacity-90">
        {ride.coverImageUrl ? (
          // Always `null` today (KI-023, no S3 pipeline yet) — same inert branch
          // `RideDetailView` already carries.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ride.coverImageUrl}
            alt=""
            className="h-40 w-full rounded-lg object-cover"
          />
        ) : null}

        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-text">{ride.title}</p>
          <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
        </div>

        <p className="text-sm text-text-secondary">
          {RIDE_DISCOVERY_TERMS.organizedByLabel}: {ride.organizer.name}
        </p>

        <p className="text-sm text-text">
          {formatDate(startDate, { timeZone: ride.startTimezone })}
          {', '}
          {formatTime(startDate, { timeZone: ride.startTimezone })}
        </p>

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
        </MetricRow>

        <MetricTile
          label={RIDE_DETAIL_TERMS.priceLabel}
          {...formatPriceParts(ride.priceRub)}
        />
      </Card>
    </Link>
  );
}
