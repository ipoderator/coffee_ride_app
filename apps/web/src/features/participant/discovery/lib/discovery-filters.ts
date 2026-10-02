import {
  BICYCLE_TYPES,
  DIFFICULTY_LEVELS,
  type BicycleType,
  type DifficultyLevel,
} from 'types';
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

/**
 * The chips as URL params (`?type=gravel&week=1&pace=from20to25&difficulty=3&free=1`),
 * so a choice survives the «Заезды / Карта» switch, a reload and a shared link.
 * An inactive chip writes nothing; unknown or malformed values are dropped on
 * read rather than trusted.
 */
export function filtersFromSearchParams(
  params: URLSearchParams,
): DiscoveryFilters {
  const type = params.get('type');
  const pace = params.get('pace');
  const difficulty = Number(params.get('difficulty'));
  return {
    bicycleType: BICYCLE_TYPES.find((value) => value === type),
    thisWeek: params.get('week') === '1',
    pace: PACE_BUCKETS.find((value) => value === pace),
    difficulty: DIFFICULTY_LEVELS.find((value) => value === difficulty),
    free: params.get('free') === '1',
  };
}

/** Writes the chips into `params` (clearing the inactive ones); other params stay. */
export function applyFiltersToSearchParams(
  params: URLSearchParams,
  filters: DiscoveryFilters,
): void {
  const entries: [string, string | undefined][] = [
    ['type', filters.bicycleType],
    ['week', filters.thisWeek ? '1' : undefined],
    ['pace', filters.pace],
    ['difficulty', filters.difficulty?.toString()],
    ['free', filters.free ? '1' : undefined],
  ];
  for (const [key, value] of entries) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
}
