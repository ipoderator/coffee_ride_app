import type { PublicRideListItem } from 'types';
import {
  formatDistanceParts,
  formatElevationParts,
  formatGroupPaceParts,
  formatPaceRangeParts,
  formatSpeedParts,
  METRIC_TERMS,
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
  const pace = ridePace(ride);
  if (pace) metrics.push({ key: 'pace', ...pace });
  return metrics;
}

/** CR-117's pace derivation: groups first, then the ride's own `paceKmh`. */
function ridePace(
  ride: PublicRideListItem,
): { parts: MetricParts; suffix?: string } | null {
  if (ride.groups.length >= 2) {
    return {
      parts: formatPaceRangeParts(ride.groups.map((group) => group.paceKmh)),
      suffix: RIDE_DISCOVERY_ROW_TERMS.groupsCount(ride.groups.length),
    };
  }
  if (ride.groups.length === 1) {
    return { parts: formatGroupPaceParts(ride.groups[0]?.paceKmh) };
  }
  if (ride.paceKmh !== null) return { parts: formatSpeedParts(ride.paceKmh) };
  return null;
}

export interface RideCardMetric {
  key: 'distance' | 'elevation' | 'pace';
  label: string;
  parts: MetricParts;
  /** Under the value — the pace groups count. */
  sub?: string;
  missing: boolean;
}

/**
 * CR-144: the grid card's three labelled columns, always in `docs/design.md`
 * §6's order — a missing value stays as its column with «—» (never `0`, never
 * dropped, so columns line up across cards). `null` when all three are
 * missing: the card says so in one line instead of three dashes.
 */
export function buildRideCardMetrics(
  ride: PublicRideListItem,
): RideCardMetric[] | null {
  const pace = ridePace(ride);
  const metrics: RideCardMetric[] = [
    {
      key: 'distance',
      label: METRIC_TERMS.distance,
      parts: formatDistanceParts(ride.distanceKm),
      missing: ride.distanceKm === null,
    },
    {
      key: 'elevation',
      label: METRIC_TERMS.elevation,
      parts: formatElevationParts(ride.elevationGainMeters),
      missing: ride.elevationGainMeters === null,
    },
    {
      key: 'pace',
      label: METRIC_TERMS.pace,
      parts: pace?.parts ?? formatSpeedParts(null),
      sub: pace?.suffix,
      missing: pace === null,
    },
  ];
  return metrics.every((metric) => metric.missing) ? null : metrics;
}

export interface RideCardSeats {
  /** «17 из 20 участников» / «3 участника». */
  count: string;
  /** «Осталось 3 места» / «Мест нет» / «Без ограничения мест». */
  note: string;
  /** Drives the note's and the bar's ink. */
  level: 'low' | 'full' | 'open';
  /** Bar fill, 0–100; `null` without a capacity limit (no bar). */
  fillPercent: number | null;
}

/**
 * CR-144: the grid card's seats line and fill bar. CR-153: a closed
 * registration says so («Запись закрыта») instead of the seats left, a full
 * ride names its queue («Мест нет · 2 в очереди»), and `short` drops
 * «участников» from the count («4 из 10») for the compact card.
 */
export function rideCardSeats(
  ride: PublicRideListItem,
  { short = false }: { short?: boolean } = {},
): RideCardSeats {
  const left = ridesSeatsLeft(ride);
  const closed = ride.status === 'registration_closed';
  if (left === null || ride.participantLimit === null) {
    return {
      count: RIDE_DISCOVERY_TERMS.participantsCount(ride.registrationsCount),
      note: closed
        ? RIDE_DISCOVERY_TERMS.registrationClosedNote
        : RIDE_DISCOVERY_TERMS.noSeatsLimit,
      level: 'open',
      fillPercent: null,
    };
  }
  let note = ridesSeatsLabel(ride)!;
  if (closed) {
    note = RIDE_DISCOVERY_TERMS.registrationClosedNote;
  } else if (left === 0 && ride.waitlistCount > 0) {
    note = `${note} · ${RIDE_DISCOVERY_TERMS.waitlistQueued(ride.waitlistCount)}`;
  }
  return {
    count: (short
      ? RIDE_DISCOVERY_TERMS.seatsTakenShort
      : RIDE_DISCOVERY_TERMS.seatsTaken)(
      ride.registrationsCount,
      ride.participantLimit,
    ),
    note,
    level:
      closed || left === 0
        ? 'full'
        : left <= LOW_SEATS_THRESHOLD
          ? 'low'
          : 'open',
    fillPercent: Math.min(
      100,
      Math.round((ride.registrationsCount / ride.participantLimit) * 100),
    ),
  };
}

/**
 * CR-185 (UX handoff P2): a ride worth the featured card's space — it shows
 * a route and the facts to choose by. Open for registration, a drawn route
 * (≥ 2 points), a start point and a distance.
 */
export function isFeatureable(ride: PublicRideListItem): boolean {
  return (
    ride.status === 'registration_open' &&
    (ride.routePreview?.length ?? 0) >= 2 &&
    ride.startLat !== null &&
    ride.startLng !== null &&
    ride.distanceKm !== null
  );
}

/**
 * The featured «Ближайший» card (CR-153): the soonest ride that
 * {@link isFeatureable} (the list is already soonest-first). CR-185: no more
 * fallback to the soonest ride of any kind — without a qualifying ride there
 * is no featured card, rather than half a phone screen of empty cover.
 */
export function pickFeaturedRide(
  rides: readonly PublicRideListItem[],
): PublicRideListItem | null {
  return rides.find(isFeatureable) ?? null;
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
 * ADR-024: the route-cover grid's status chip. "Мало мест" and «Список
 * ожидания» aren't `RideStatus` values — they're derived, higher-priority
 * reads of an otherwise-ordinary `registration_open` ride with few or no
 * seats left, shown instead of (not alongside) the ordinary status label.
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
    // CR-144: full but still open = the waitlist is what's on offer
    // (`joinWaitlist` accepts exactly this state), not a green «open».
    if (left === 0) {
      return { label: RIDE_DISCOVERY_TERMS.waitlistStatusLabel, tone: 'info' };
    }
  }
  return RIDE_STATUS_TERMS[ride.status];
}
