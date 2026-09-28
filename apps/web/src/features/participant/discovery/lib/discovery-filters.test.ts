import { describe, expect, it } from 'vitest';
import {
  NO_DISCOVERY_FILTERS,
  endOfWeek,
  filtersToQuery,
  hasActiveFilters,
} from './discovery-filters';

describe('discovery filters (CR-153)', () => {
  it('ends the week on Sunday 23:59:59.999 local time, Monday-first', () => {
    // Wednesday 30 Sep 2026, 10:00 local.
    const end = endOfWeek(new Date(2026, 8, 30, 10, 0));
    expect(end).toEqual(new Date(2026, 9, 4, 23, 59, 59, 999));
    // A Sunday is its own week's last day.
    expect(endOfWeek(new Date(2026, 9, 4, 8, 0))).toEqual(
      new Date(2026, 9, 4, 23, 59, 59, 999),
    );
  });

  it('sends nothing for inactive chips', () => {
    expect(hasActiveFilters(NO_DISCOVERY_FILTERS)).toBe(false);
    expect(
      Object.values(filtersToQuery(NO_DISCOVERY_FILTERS)).filter(
        (value) => value !== undefined,
      ),
    ).toEqual([]);
  });

  it('maps every chip to its GET /v1/rides param', () => {
    const now = new Date(2026, 8, 30, 10, 0);
    const filters = {
      bicycleType: 'gravel',
      thisWeek: true,
      pace: 'from25to30',
      difficulty: 3,
      free: true,
    } as const;
    expect(hasActiveFilters(filters)).toBe(true);
    expect(filtersToQuery(filters, now)).toEqual({
      bicycleType: 'gravel',
      startsTo: new Date(2026, 9, 4, 23, 59, 59, 999).toISOString(),
      paceMin: 25,
      paceMax: 30,
      difficulty: 3,
      free: true,
    });
    expect(
      filtersToQuery({ ...NO_DISCOVERY_FILTERS, pace: 'upTo20' }),
    ).toMatchObject({ paceMax: 20 });
    expect(
      filtersToQuery({ ...NO_DISCOVERY_FILTERS, pace: 'from30' }).paceMax,
    ).toBeUndefined();
  });
});
