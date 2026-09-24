import type { PublicRideListItem } from 'types';
import {
  formatDistanceParts,
  formatElevationParts,
  formatGroupPaceParts,
  formatPaceRangeParts,
  formatSpeedParts,
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_DISCOVERY_TERMS,
  RIDE_STATUS_TERMS,
  type MetricParts,
  type StatusTone,
} from 'ui';

/** A ride card/cover stays legible with three or fewer seats left. */
const LOW_SEATS_THRESHOLD = 3;

export interface RideRowMetric {
  key: string;
  parts: MetricParts;
  suffix?: string;
  className?: string;
}

/**
 * `docs/design.md` §6's "first three" (distance → elevation → pace) as one
 * compact line, shared by `RideLegendRow` and `RouteCover`'s grid card
 * (ADR-024) so the two views never drift on how a ride's headline numbers are
 * derived. Pace comes from the pace groups when there are any (CR-117): two
 * or more → the range plus the group count, one → that group's pace;
 * otherwise the ride's own `paceKmh`. A missing value is left out, never `0`.
 */
export function buildRideRowMetrics(ride: PublicRideListItem): RideRowMetric[] {
  const metrics: RideRowMetric[] = [];
  if (ride.distanceKm !== null) {
    metrics.push({
      key: 'distance',
      parts: formatDistanceParts(ride.distanceKm),
    });
  }
  if (ride.elevationGainMeters !== null) {
    metrics.push({
      key: 'elevation',
      parts: formatElevationParts(ride.elevationGainMeters),
      className: 'text-elevation',
    });
  }
  if (ride.groups.length >= 2) {
    metrics.push({
      key: 'pace',
      parts: formatPaceRangeParts(ride.groups.map((group) => group.paceKmh)),
      suffix: RIDE_DISCOVERY_ROW_TERMS.groupsCount(ride.groups.length),
    });
  } else if (ride.groups.length === 1) {
    metrics.push({
      key: 'pace',
      parts: formatGroupPaceParts(ride.groups[0]?.paceKmh),
    });
  } else if (ride.paceKmh !== null) {
    metrics.push({ key: 'pace', parts: formatSpeedParts(ride.paceKmh) });
  }
  return metrics;
}

/** Seats-left chip text, or `null` when the ride has no capacity limit. */
export function ridesSeatsLabel(ride: PublicRideListItem): string | null {
  if (ride.participantLimit === null) return null;
  const left = Math.max(0, ride.participantLimit - ride.registrationsCount);
  return left === 0
    ? RIDE_DISCOVERY_ROW_TERMS.noSeats
    : RIDE_DISCOVERY_ROW_TERMS.seatsLeft(left);
}

/** Seats left as a number, or `null` when the ride has no capacity limit —
 * for callers that need the raw count (e.g. the "мало мест" threshold). */
export function ridesSeatsLeft(ride: PublicRideListItem): number | null {
  if (ride.participantLimit === null) return null;
  return Math.max(0, ride.participantLimit - ride.registrationsCount);
}

/**
 * ADR-024: the route-cover grid's status chip. "Мало мест" isn't a
 * `RideStatus` value — it's a derived, higher-priority read of an
 * otherwise-ordinary `registration_open` ride with few seats left, shown
 * instead of (not alongside) the ordinary status label.
 */
export function discoveryStatusTerm(ride: PublicRideListItem): {
  label: string;
  tone: StatusTone;
} {
  if (ride.status === 'registration_open') {
    const left = ridesSeatsLeft(ride);
    if (left !== null && left > 0 && left <= LOW_SEATS_THRESHOLD) {
      return { label: RIDE_DISCOVERY_TERMS.lowSeatsLabel, tone: 'warning' };
    }
  }
  return RIDE_STATUS_TERMS[ride.status];
}
