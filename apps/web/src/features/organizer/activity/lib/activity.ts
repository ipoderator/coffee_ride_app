import type { Ride, RideParticipantSummary } from 'types';
import { formatShortWeekday } from 'ui';

const DAY_MS = 86_400_000;

/** Days in the «Записи по дням» chart (one calendar week) — also how far back
 * `selectActivityRides` looks, which always covers the week's Monday. */
export const ACTIVITY_DAYS = 7;

/** Upper bound on rides whose participants the widget fetches (one request each). */
export const MAX_ACTIVITY_RIDES = 10;

/** One registration, joined with the ride it's for. */
export interface ActivityEntry {
  id: string;
  displayName: string | null;
  groupName: string | null;
  rideTitle: string;
  createdAt: Date;
}

export interface ActivityDay {
  /** `YYYY-MM-DD` in the viewer's zone — stable React key. */
  key: string;
  weekday: string;
  count: number;
  isToday: boolean;
  /** The week's busiest day so far (the mockup's highlighted bar); none on an all-zero week. */
  isPeak: boolean;
}

/**
 * The rides whose registrations can fall inside the chart's window: not a
 * draft (can't have registrations) or cancelled (its registrations are no
 * longer active), and starting no earlier than the window's first day —
 * registration closes before a start, so an older ride can't have gained a
 * registration inside the window. Soonest first, capped at
 * `MAX_ACTIVITY_RIDES` to bound the per-ride fetches.
 */
export function selectActivityRides(rides: Ride[], now: Date): Ride[] {
  const windowStart = now.getTime() - ACTIVITY_DAYS * DAY_MS;
  return rides
    .filter(
      (ride) =>
        ride.status !== 'draft' &&
        ride.status !== 'cancelled' &&
        new Date(ride.startsAt).getTime() >= windowStart,
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
    .slice(0, MAX_ACTIVITY_RIDES);
}

export function toActivityEntries(
  ride: Pick<Ride, 'title'>,
  participants: RideParticipantSummary[],
): ActivityEntry[] {
  return participants.map((participant) => ({
    id: participant.id,
    displayName: participant.displayName,
    groupName: participant.group?.name ?? null,
    rideTitle: ride.title,
    createdAt: new Date(participant.createdAt),
  }));
}

/** Newest first, at most `limit`. */
export function recentEntries(
  entries: ActivityEntry[],
  limit = 5,
): ActivityEntry[] {
  return [...entries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

function dayKey(date: Date, timeZone: string): string {
  // `en-CA` formats a date as `YYYY-MM-DD`.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Monday-first position of each short weekday — a Russian calendar week.
const WEEK_POSITION: Record<string, number> = {
  пн: 0,
  вт: 1,
  ср: 2,
  чт: 3,
  пт: 4,
  сб: 5,
  вс: 6,
};

/**
 * Registration counts per calendar day of the current week (пн–вс, CR-131 —
 * the mockup's «эта неделя») in `timeZone`, the viewer's own. Days still
 * ahead are present with `count: 0`, so the chart keeps its seven columns.
 * The busiest day is flagged `isPeak` (the earliest one on a tie).
 */
export function registrationsPerDay(
  entries: ActivityEntry[],
  now: Date,
  timeZone: string,
): ActivityDay[] {
  const todayPosition =
    WEEK_POSITION[formatShortWeekday(now, { timeZone })] ?? 0;
  const days: ActivityDay[] = [];
  for (let position = 0; position < ACTIVITY_DAYS; position += 1) {
    const date = new Date(now.getTime() + (position - todayPosition) * DAY_MS);
    days.push({
      key: dayKey(date, timeZone),
      weekday: formatShortWeekday(date, { timeZone }),
      count: 0,
      isToday: position === todayPosition,
      isPeak: false,
    });
  }
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const entry of entries) {
    const day = byKey.get(dayKey(entry.createdAt, timeZone));
    if (day) day.count += 1;
  }
  const peak = days.reduce<ActivityDay | null>(
    (best, day) => (day.count > (best?.count ?? 0) ? day : best),
    null,
  );
  if (peak) peak.isPeak = true;
  return days;
}
