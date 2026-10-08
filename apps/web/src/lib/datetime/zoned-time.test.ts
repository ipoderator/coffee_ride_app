import { describe, expect, it } from 'vitest';
import { utcIsoToZonedLocalInput, zonedTimeToUtcIso } from './zoned-time';

describe('zonedTimeToUtcIso', () => {
  it('converts a Moscow (UTC+3) local time to the correct UTC instant', () => {
    expect(zonedTimeToUtcIso('2027-05-01T08:00', 'Europe/Moscow')).toBe(
      '2027-05-01T05:00:00.000Z',
    );
  });

  it('converts a Krasnoyarsk (UTC+7) local time to the correct UTC instant', () => {
    expect(zonedTimeToUtcIso('2027-05-01T08:00', 'Asia/Krasnoyarsk')).toBe(
      '2027-05-01T01:00:00.000Z',
    );
  });

  it('converts a Kaliningrad (UTC+2) local time to the correct UTC instant', () => {
    expect(zonedTimeToUtcIso('2027-01-15T09:30', 'Europe/Kaliningrad')).toBe(
      '2027-01-15T07:30:00.000Z',
    );
  });

  it('round-trips midnight correctly across the UTC day boundary', () => {
    // 01:00 in Vladivostok (UTC+10) on the 2nd is 15:00 UTC on the 1st.
    expect(zonedTimeToUtcIso('2027-06-02T01:00', 'Asia/Vladivostok')).toBe(
      '2027-06-01T15:00:00.000Z',
    );
  });
});

// QA live audit 2026-10-08, item 1: the wizard's date + time + zone → instant
// edges — the start's day must not drift when its UTC instant crosses midnight.
describe('zonedTimeToUtcIso — day, year and zone edges', () => {
  it('keeps an early-morning Moscow start on its own day (previous UTC day)', () => {
    expect(zonedTimeToUtcIso('2026-10-09T00:30', 'Europe/Moscow')).toBe(
      '2026-10-08T21:30:00.000Z',
    );
  });

  it('keeps a late-evening Kaliningrad start on the same UTC day', () => {
    expect(zonedTimeToUtcIso('2026-10-09T23:30', 'Europe/Kaliningrad')).toBe(
      '2026-10-09T21:30:00.000Z',
    );
  });

  it('crosses the year boundary for a New Year start in Kamchatka (UTC+12)', () => {
    expect(zonedTimeToUtcIso('2027-01-01T00:00', 'Asia/Kamchatka')).toBe(
      '2026-12-31T12:00:00.000Z',
    );
  });

  it('gives the same wall-clock time a different instant in another zone', () => {
    const moscow = zonedTimeToUtcIso('2026-10-09T08:00', 'Europe/Moscow');
    const vladivostok = zonedTimeToUtcIso(
      '2026-10-09T08:00',
      'Asia/Vladivostok',
    );
    expect(moscow).toBe('2026-10-09T05:00:00.000Z');
    expect(vladivostok).toBe('2026-10-08T22:00:00.000Z');
    expect(utcIsoToZonedLocalInput(moscow, 'Europe/Moscow')).toBe(
      '2026-10-09T08:00',
    );
    expect(utcIsoToZonedLocalInput(vladivostok, 'Asia/Vladivostok')).toBe(
      '2026-10-09T08:00',
    );
  });

  it('resolves the offset at the result, not the probe, on a DST change day', () => {
    // 2027-03-14: New York switches to EDT (UTC−4) at 07:00Z; 05:00 local is
    // already EDT, while the first probe (05:00Z) still reads EST (UTC−5).
    expect(zonedTimeToUtcIso('2027-03-14T05:00', 'America/New_York')).toBe(
      '2027-03-14T09:00:00.000Z',
    );
  });

  it('does not depend on the browser zone', () => {
    // The process zone is whatever the runner has; the result is fixed.
    expect(zonedTimeToUtcIso('2026-10-09T08:00', 'Europe/Moscow')).toBe(
      '2026-10-09T05:00:00.000Z',
    );
  });
});

describe('utcIsoToZonedLocalInput', () => {
  it('converts a UTC instant back to Moscow (UTC+3) local wall-clock time', () => {
    expect(
      utcIsoToZonedLocalInput('2027-05-01T05:00:00.000Z', 'Europe/Moscow'),
    ).toBe('2027-05-01T08:00');
  });

  it('converts a UTC instant back to Krasnoyarsk (UTC+7) local wall-clock time', () => {
    expect(
      utcIsoToZonedLocalInput('2027-05-01T01:00:00.000Z', 'Asia/Krasnoyarsk'),
    ).toBe('2027-05-01T08:00');
  });

  it('round-trips midnight correctly across the UTC day boundary', () => {
    expect(
      utcIsoToZonedLocalInput('2027-06-01T15:00:00.000Z', 'Asia/Vladivostok'),
    ).toBe('2027-06-02T01:00');
  });

  it('is the exact inverse of zonedTimeToUtcIso for every Russian zone this product supports', () => {
    const localValue = '2027-03-10T14:45';
    for (const timeZone of [
      'Europe/Kaliningrad',
      'Europe/Moscow',
      'Asia/Yekaterinburg',
      'Asia/Omsk',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Yakutsk',
      'Asia/Vladivostok',
      'Asia/Magadan',
      'Asia/Kamchatka',
    ]) {
      const utc = zonedTimeToUtcIso(localValue, timeZone);
      expect(utcIsoToZonedLocalInput(utc, timeZone)).toBe(localValue);
    }
  });
});
