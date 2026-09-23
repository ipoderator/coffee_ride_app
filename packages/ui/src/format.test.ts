import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDistance,
  formatDistanceParts,
  formatDuration,
  formatDurationParts,
  formatElevation,
  formatElevationParts,
  formatParticipants,
  formatParticipantsParts,
  formatPrice,
  formatPriceParts,
  formatRating,
  formatRatingParts,
  formatSpeed,
  formatSpeedParts,
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

describe('formatRating', () => {
  it('formats with 1 decimal, comma separator, NBSP-joined star unit', () => {
    expect(formatRating(4.8, 12)).toBe(`4,8${NBSP}★`);
  });

  it('renders no reviews yet as an em dash, not "0"', () => {
    expect(formatRating(null, 0)).toBe(EM_DASH);
    expect(formatRating(4.8, 0)).toBe(EM_DASH);
  });

  it('renders missing data as an em dash', () => {
    expect(formatRating(null, 5)).toBe(EM_DASH);
    expect(formatRating(undefined, undefined)).toBe(EM_DASH);
  });
});

describe('*Parts helpers (CR-065)', () => {
  it('formatDistanceParts splits value and unit', () => {
    expect(formatDistanceParts(42.3)).toEqual({ value: '42,3', unit: 'км' });
    expect(formatDistanceParts(null)).toEqual({ value: EM_DASH, unit: '' });
  });

  it('formatElevationParts splits value and unit', () => {
    expect(formatElevationParts(1250)).toEqual({
      value: `1${NBSP}250`,
      unit: 'м',
    });
    expect(formatElevationParts(undefined)).toEqual({
      value: EM_DASH,
      unit: '',
    });
  });

  it('formatSpeedParts splits value and unit', () => {
    expect(formatSpeedParts(24.5)).toEqual({ value: '24,5', unit: 'км/ч' });
  });

  it('formatDurationParts splits value and unit, including the zero-remainder case', () => {
    expect(formatDurationParts(45)).toEqual({ value: '45', unit: 'мин' });
    expect(formatDurationParts(150)).toEqual({
      value: `2${NBSP}ч${NBSP}30`,
      unit: 'мин',
    });
    expect(formatDurationParts(120)).toEqual({ value: '2', unit: 'ч' });
  });

  it('formatPriceParts splits value and unit, free as a unit-less value', () => {
    expect(formatPriceParts(1500)).toEqual({ value: `1${NBSP}500`, unit: '₽' });
    expect(formatPriceParts(0)).toEqual({ value: 'Бесплатно', unit: '' });
  });

  it('formatRatingParts splits value and unit, no reviews as missing', () => {
    expect(formatRatingParts(4.8, 12)).toEqual({ value: '4,8', unit: '★' });
    expect(formatRatingParts(null, 0)).toEqual({ value: EM_DASH, unit: '' });
  });

  it('formatParticipantsParts has no separate unit — the ratio is the whole value', () => {
    expect(formatParticipantsParts(12, 20)).toEqual({
      value: `12${NBSP}из${NBSP}20`,
      unit: '',
    });
    expect(formatParticipantsParts(null, 20)).toEqual({
      value: EM_DASH,
      unit: '',
    });
  });

  it('every joined format* function equals its Parts counterpart re-joined by NBSP', () => {
    // Guards the refactor: the public joined contract must stay byte-identical to
    // what it was before *Parts existed.
    expect(formatDistance(42.3)).toBe('42,3' + NBSP + 'км');
    expect(formatElevation(1250)).toBe(`1${NBSP}250${NBSP}м`);
    expect(formatPrice(1500)).toBe(`1${NBSP}500${NBSP}₽`);
  });
});

// CR-119 (ride detail «Топокарта»).
describe('CR-119 formatters', () => {
  it('formats a ride start line with weekday, time and a Moscow-relative zone', async () => {
    const { formatRideStartLine } = await import('./format');
    const now = new Date('2026-01-01T00:00:00Z');
    // 2026-06-13T04:30Z is Saturday 07:30 in Moscow.
    expect(
      formatRideStartLine(new Date('2026-06-13T04:30:00Z'), {
        timeZone: 'Europe/Moscow',
        now,
      }),
    ).toBe('сб 13 июня · 07:30 · МСК');
    // Same instant in Yekaterinburg (UTC+5) → МСК+2.
    expect(
      formatRideStartLine(new Date('2026-06-13T04:30:00Z'), {
        timeZone: 'Asia/Yekaterinburg',
        now,
      }),
    ).toBe('сб 13 июня · 09:30 · МСК+2');
    // Kaliningrad is behind Moscow; the year shows when it isn't the current one.
    expect(
      formatRideStartLine(new Date('2027-01-03T08:00:00Z'), {
        timeZone: 'Europe/Kaliningrad',
        now,
      }),
    ).toBe('вс 3 января 2027 · 10:00 · МСК−1');
    expect(formatRideStartLine(null)).toBe('—');
  });

  it('falls back to a UTC offset for zones outside Russia', async () => {
    const { formatTimeZoneHint } = await import('./format');
    const date = new Date('2026-06-13T04:30:00Z');
    expect(formatTimeZoneHint(date, 'UTC')).toBe('UTC');
    expect(formatTimeZoneHint(date, 'Europe/Berlin')).toBe('UTC+2');
    expect(formatTimeZoneHint(date, 'Asia/Kolkata')).toBe('UTC+5:30');
  });

  it('formats group paces compactly, and a pace range across groups', async () => {
    const { formatGroupPace, formatGroupPaceParts, formatPaceRangeParts } =
      await import('./format');
    expect(formatGroupPace(25)).toBe(`25${NBSP}км/ч`);
    expect(formatGroupPaceParts(27.5)).toEqual({ value: '27,5', unit: 'км/ч' });
    expect(formatGroupPaceParts(null)).toEqual({ value: '—', unit: '' });
    expect(formatPaceRangeParts([35, 25, 30])).toEqual({
      value: '25–35',
      unit: 'км/ч',
    });
    expect(formatPaceRangeParts([25, 25])).toEqual({
      value: '25',
      unit: 'км/ч',
    });
    expect(formatPaceRangeParts([])).toEqual({ value: '—', unit: '' });
  });
});

describe('formatStartPlace', () => {
  it('uses a real label, falls back to the description for a bare «Старт»', async () => {
    const { formatStartPlace } = await import('./format');
    expect(formatStartPlace('м. Спортивная')).toBe('м. Спортивная');
    expect(formatStartPlace('Старт', 'Парковка у велотрека Крылатское.')).toBe(
      'Парковка у велотрека Крылатское',
    );
    expect(formatStartPlace(' старт ')).toBeNull();
    expect(formatStartPlace(null, '  ')).toBeNull();
  });
});
