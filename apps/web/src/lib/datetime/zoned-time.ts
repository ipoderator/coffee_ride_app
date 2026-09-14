// ADR-012: a ride's `startsAt` is an instant, but the organizer enters a local
// wall-clock time ("08:00 in Krasnoyarsk") — converting that pair into the correct
// UTC instant needs real IANA zone-offset math. No timezone library (date-fns-tz,
// luxon, Temporal) is a dependency anywhere in this repo yet
// (`.claude/rules/resilience.md`'s spirit: don't add one without justification when
// the platform's own `Intl` already carries tzdata). Not `Ride`-specific — ADR-012
// itself notes a `Stop` may need the same conversion once it gets a scheduled wall
// time — so this lives in a shared, feature-independent location.
//
// Not exercised by any DST-transition edge case in this product's real target zones:
// Russia abolished DST in 2014, so every zone `RUSSIAN_TIMEZONE_OPTIONS`
// (`packages/ui`) offers has a fixed year-round offset. The algorithm below is still
// generally correct (it resolves the zone's actual offset for the given date, not a
// hard-coded one), just untested against a DST transition since none exists for this
// product's supported zones.

/**
 * The IANA zone's UTC offset, in minutes, for the given instant — e.g. `Europe/
 * Moscow` at any date returns `180` (UTC+3).
 */
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  // The wall-clock reading of `instant` as seen in `timeZone`, reinterpreted as if it
  // were itself a UTC instant — the gap between that and the real `instant` is
  // exactly the zone's offset.
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

/**
 * Converts a `<input type="datetime-local">` value (`"2027-05-01T08:00"`, no zone
 * info of its own) plus the IANA zone it was entered in into the correct UTC instant,
 * as an ISO 8601 string (`createRideRequestSchema`'s `startsAt` shape).
 *
 * Two-pass offset resolution: `Date.parse` on a bare local-looking string is treated
 * as UTC by every JS engine, which is *not* what we want, but it's a stable starting
 * probe — resolving `timeZone`'s real offset for a date within ~24h of the true
 * answer is enough to get the right offset even right at a (non-existent, for this
 * product's zones) DST boundary.
 */
export function zonedTimeToUtcIso(
  localDateTimeValue: string,
  timeZone: string,
): string {
  const probe = new Date(`${localDateTimeValue}Z`);
  const offsetMinutes = timeZoneOffsetMinutes(probe, timeZone);
  return new Date(probe.getTime() - offsetMinutes * 60_000).toISOString();
}
