import { describe, expect, it } from 'vitest';
import { isRideOverdue } from './overdue';

const NOW = new Date('2026-10-02T08:00:00Z');
const PAST = '2026-10-01T05:00:00Z';
const FUTURE = '2026-10-03T05:00:00Z';

describe('isRideOverdue', () => {
  it('flags a past start for every status before `started`', () => {
    for (const status of [
      'published',
      'registration_open',
      'registration_closed',
    ] as const) {
      expect(isRideOverdue({ status, startsAt: PAST }, NOW)).toBe(true);
    }
  });

  it('counts the start minute itself as passed', () => {
    expect(
      isRideOverdue({ status: 'published', startsAt: NOW.toISOString() }, NOW),
    ).toBe(true);
  });

  it('ignores a future start and every other status', () => {
    expect(
      isRideOverdue({ status: 'registration_open', startsAt: FUTURE }, NOW),
    ).toBe(false);
    for (const status of [
      'draft',
      'started',
      'finished',
      'cancelled',
    ] as const) {
      expect(isRideOverdue({ status, startsAt: PAST }, NOW)).toBe(false);
    }
  });
});
