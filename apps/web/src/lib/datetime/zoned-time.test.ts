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
