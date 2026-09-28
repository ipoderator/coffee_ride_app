import type { BicycleType, DifficultyLevel } from 'types';
import { RIDE_DISCOVERY_TERMS } from 'ui';
import type { ListPublicRidesParams } from '../api';

export type PaceBucket = keyof typeof RIDE_DISCOVERY_TERMS.paceFilterOptions;

/** km/h, inclusive — `GET /v1/rides`'s `paceMin`/`paceMax` (CR-153). */
const PACE_RANGES: Record<PaceBucket, { paceMin?: number; paceMax?: number }> =
  {
    upTo20: { paceMax: 20 },
    from20to25: { paceMin: 20, paceMax: 25 },
    from25to30: { paceMin: 25, paceMax: 30 },
    from30: { paceMin: 30 },
  };

export const PACE_BUCKETS = Object.keys(PACE_RANGES) as PaceBucket[];

/** The discovery filter chips' state (CR-153), shared by both views. */
export interface DiscoveryFilters {
  bicycleType?: BicycleType;
  thisWeek: boolean;
  pace?: PaceBucket;
  difficulty?: DifficultyLevel;
  free: boolean;
}

export const NO_DISCOVERY_FILTERS: DiscoveryFilters = {
  thisWeek: false,
  free: false,
};

export function hasActiveFilters(filters: DiscoveryFilters): boolean {
  return (
    filters.bicycleType !== undefined ||
    filters.thisWeek ||
    filters.pace !== undefined ||
    filters.difficulty !== undefined ||
    filters.free
  );
}

/**
 * The last instant of the viewer's current calendar week, Monday–Sunday
 * (the Russian week, same as the organizer's «эта неделя», CR-131), in the
 * browser's own timezone.
 */
export function endOfWeek(now: Date): Date {
  const end = new Date(now);
  const daysToSunday = (7 - now.getDay()) % 7;
  end.setDate(now.getDate() + daysToSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Chip state → `GET /v1/rides` params; an inactive chip sends nothing. */
export function filtersToQuery(
  filters: DiscoveryFilters,
  now: Date = new Date(),
): ListPublicRidesParams {
  return {
    bicycleType: filters.bicycleType,
    startsTo: filters.thisWeek ? endOfWeek(now).toISOString() : undefined,
    ...(filters.pace ? PACE_RANGES[filters.pace] : {}),
    difficulty: filters.difficulty,
    free: filters.free ? true : undefined,
  };
}
