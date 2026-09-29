import { describe, expect, it } from 'vitest';
import { buildIcs } from './calendar';

const event = {
  uid: 'ride-1@coffee-ride',
  title: 'Гравий на выходные: Крылатское, Архангельское',
  startsAt: new Date('2026-10-04T06:00:00.000Z'),
  durationMinutes: 210,
  location: 'Парковка у велотрека; Крылатское',
  url: 'https://example.com/rides/ride-1',
  description: 'Первая строка\nВторая',
};

describe('buildIcs', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');

  it('writes one UTC event with start, end and escaped text', () => {
    const ics = buildIcs(event, now);
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTAMP:20260929T120000Z');
    expect(lines).toContain('DTSTART:20261004T060000Z');
    expect(lines).toContain('DTEND:20261004T093000Z');
    expect(ics).toContain('LOCATION:Парковка у велотрека\\; Крылатское');
    expect(ics).toContain('DESCRIPTION:Первая строка\\nВторая');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('omits DTEND without a duration', () => {
    const ics = buildIcs({ ...event, durationMinutes: null }, now);
    expect(ics).not.toContain('DTEND');
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const ics = buildIcs(
      { ...event, title: 'Длинное название '.repeat(8) },
      now,
    );
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${'Длинное название '.repeat(8)}`);
  });
});
