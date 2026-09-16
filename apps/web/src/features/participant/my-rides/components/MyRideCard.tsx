import Link from 'next/link';
import type { MyRegistrationSummary } from 'types';
import {
  Card,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DISCOVERY_TERMS,
  RIDE_STATUS_TERMS,
  StatusBadge,
  formatDate,
  formatDistanceParts,
  formatElevationParts,
  formatSpeedParts,
  formatTime,
} from 'ui';

/**
 * Feature-local, not `packages/ui` and not a reuse of discovery's own `RideCard`
 * (`.claude/rules/extensibility.md`: a feature module must not depend on another
 * feature module's internals — `docs/design.md` §9 already documents `RideCard` as
 * feature-local to discovery for the same reason). Read-only: links into
 * `/rides/[id]` for anything actionable (cancellation), same precedent CR-028 set for
 * its own independent `RouteMapPlaceholder`.
 */
export function MyRideCard({ item }: { item: MyRegistrationSummary }) {
  const { ride } = item;
  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startDate = new Date(ride.startsAt);

  return (
    <Link href={`/rides/${ride.id}`}>
      <Card className="flex flex-col gap-3 transition-opacity hover:opacity-90">
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
      </Card>
    </Link>
  );
}
