import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatParticipants,
  formatPrice,
  formatSpeed,
  formatTime,
} from './format';

const NBSP = ' ';
const EM_DASH = '—';

describe('formatDistance', () => {
  it('formats with 1 decimal, comma separator, NBSP-joined unit', () => {
    expect(formatDistance(42.3)).toBe(`42,3${NBSP}км`);
  });

  it('rounds to 1 decimal', () => {
    expect(formatDistance(42.34)).toBe(`42,3${NBSP}км`);
    expect(formatDistance(42.35)).toBe(`42,4${NBSP}км`);
  });

  it('renders missing data as an em dash, never 0', () => {
    expect(formatDistance(null)).toBe(EM_DASH);
    expect(formatDistance(undefined)).toBe(EM_DASH);
  });
});

describe('formatElevation', () => {
  it('formats whole meters with NBSP thousands grouping', () => {
    expect(formatElevation(1250)).toBe(`1${NBSP}250${NBSP}м`);
  });

  it('rounds to the nearest whole meter', () => {
    expect(formatElevation(999.6)).toBe(`1${NBSP}000${NBSP}м`);
  });

  it('does not group under a thousand', () => {
    expect(formatElevation(450)).toBe(`450${NBSP}м`);
  });

  it('renders missing data as an em dash, never 0', () => {
    expect(formatElevation(null)).toBe(EM_DASH);
  });
});

describe('formatSpeed', () => {
  it('formats with 1 decimal, comma separator', () => {
    expect(formatSpeed(24.5)).toBe(`24,5${NBSP}км/ч`);
  });

  it('renders missing data as an em dash, never 0', () => {
    expect(formatSpeed(undefined)).toBe(EM_DASH);
  });
});

describe('formatDuration', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatDuration(45)).toBe(`45${NBSP}мин`);
  });

  it('formats an hour or more as hours + minutes', () => {
    expect(formatDuration(150)).toBe(`2${NBSP}ч${NBSP}30${NBSP}мин`);
  });

  it('omits a zero minutes remainder', () => {
    expect(formatDuration(120)).toBe(`2${NBSP}ч`);
  });

  it('renders missing data as an em dash, never 0', () => {
    expect(formatDuration(null)).toBe(EM_DASH);
  });
});

describe('formatDate', () => {
  it('formats day + genitive month, omitting the year when it matches now', () => {
    const date = new Date(Date.UTC(2026, 4, 12)); // 12 May 2026
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(formatDate(date, { now })).toBe('12 мая');
  });

  it('includes the year when it differs from now', () => {
    const date = new Date(Date.UTC(2027, 4, 12)); // 12 May 2027
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(formatDate(date, { now })).toBe('12 мая 2027');
  });

  it('reads the calendar day in the given IANA timezone', () => {
    // 23:30 UTC on May 11 is already May 12 in Asia/Krasnoyarsk (UTC+7).
    const date = new Date(Date.UTC(2026, 4, 11, 23, 30));
    const now = new Date(Date.UTC(2026, 4, 1));
    expect(formatDate(date, { timeZone: 'Asia/Krasnoyarsk', now })).toBe(
      '12 мая',
    );
  });

  it('renders a missing date as an em dash', () => {
    expect(formatDate(null)).toBe(EM_DASH);
    expect(formatDate(undefined)).toBe(EM_DASH);
  });
});

describe('formatTime', () => {
  it('formats 24-hour wall-clock time', () => {
    const date = new Date(Date.UTC(2026, 4, 12, 7, 30));
    expect(formatTime(date)).toBe('07:30');
  });

  it('reads the wall-clock time in the given IANA timezone', () => {
    // 00:30 UTC is 07:30 in Asia/Krasnoyarsk (UTC+7).
    const date = new Date(Date.UTC(2026, 4, 12, 0, 30));
    expect(formatTime(date, { timeZone: 'Asia/Krasnoyarsk' })).toBe('07:30');
  });

  it('renders a missing time as an em dash', () => {
    expect(formatTime(null)).toBe(EM_DASH);
  });
});

describe('formatPrice', () => {
  it('formats whole rubles with NBSP thousands grouping', () => {
    expect(formatPrice(1500)).toBe(`1${NBSP}500${NBSP}₽`);
  });

  it('renders zero as free, not "0 ₽"', () => {
    expect(formatPrice(0)).toBe('Бесплатно');
  });

  it('renders missing price as free', () => {
    expect(formatPrice(null)).toBe('Бесплатно');
    expect(formatPrice(undefined)).toBe('Бесплатно');
  });
});

describe('formatParticipants', () => {
  it('formats current / limit', () => {
    expect(formatParticipants(12, 20)).toBe(`12${NBSP}из${NBSP}20`);
  });

  it('renders missing data as an em dash', () => {
    expect(formatParticipants(null, 20)).toBe(EM_DASH);
    expect(formatParticipants(12, undefined)).toBe(EM_DASH);
  });
});
