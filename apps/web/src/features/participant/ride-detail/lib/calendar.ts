/**
 * CR-155: «Добавить в календарь» — an RFC 5545 iCalendar file built in the
 * browser from data the page already has, so no API endpoint is involved.
 */
export interface CalendarEvent {
  uid: string;
  title: string;
  startsAt: Date;
  /** Without a duration the event has no DTEND — it ends at its start. */
  durationMinutes: number | null;
  location: string | null;
  url: string;
  description: string | null;
  /**
   * CR-190: RFC 5545 `SEQUENCE` — the ride's reschedule count. With the same
   * `UID`, a calendar that already holds the event replaces it with the
   * higher-sequence copy instead of adding a second one. Defaults to 0.
   */
  sequence?: number;
}

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Content lines longer than 75 octets are folded (RFC 5545 §3.1), never
 * inside a multi-byte character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(event: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Coffee Ride//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    ...(event.durationMinutes !== null
      ? [
          `DTEND:${utcStamp(new Date(event.startsAt.getTime() + event.durationMinutes * 60_000))}`,
        ]
      : []),
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description
      ? [`DESCRIPTION:${escapeText(event.description)}`]
      : []),
    `URL:${event.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/**
 * Hands the file to the browser as a download. Throws when it cannot, so the
 * caller can say so (CR-242 — it used to fail, or succeed, silently).
 *
 * CR-242: the object URL is revoked a moment later, not right after
 * `click()` — Firefox and Safari start the download asynchronously and could
 * lose it. A browser without the `download` attribute (older in-app ones)
 * gets the file as a `data:` URL, which it opens or imports itself.
 */
export function downloadIcs(event: CalendarEvent, filename: string): void {
  const ics = buildIcs(event);
  const link = document.createElement('a');
  if (!('download' in link)) {
    window.location.assign(
      `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
    );
    return;
  }
  const href = URL.createObjectURL(
    new Blob([ics], { type: 'text/calendar;charset=utf-8' }),
  );
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS);
}

const REVOKE_DELAY_MS = 30_000;
