import type {
  OrganizerActivityDay,
  OrganizerActivityRegistration,
} from 'types';
import { formatShortWeekday } from 'ui';

const DAY_MS = 86_400_000;

/** Days in the «Записи по дням» chart (one calendar week). */
export const ACTIVITY_DAYS = 7;

/** One registration in the «Новые записи» feed. */
export interface ActivityEntry {
  /** The registration's id — with `rideId`, addresses the rider's card (CR-149). */
  id: string;
  rideId: string;
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

export function toActivityEntry(
  registration: OrganizerActivityRegistration,
): ActivityEntry {
  return {
    id: registration.id,
    rideId: registration.rideId,
    displayName: registration.displayName,
    groupName: registration.group?.name ?? null,
    rideTitle: registration.rideTitle,
    createdAt: new Date(registration.createdAt),
  };
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
 * The current calendar week (пн–вс, CR-131 — the mockup's «эта неделя») in
 * `timeZone`, the viewer's own, all counts at zero. Its first `key` is the
 * `from` the activity endpoint buckets from.
 */
export function currentWeek(now: Date, timeZone: string): ActivityDay[] {
  const todayPosition =
    WEEK_POSITION[formatShortWeekday(now, { timeZone })] ?? 0;
  return Array.from({ length: ACTIVITY_DAYS }, (_, position) => {
    const date = new Date(now.getTime() + (position - todayPosition) * DAY_MS);
    return {
      key: dayKey(date, timeZone),
      weekday: formatShortWeekday(date, { timeZone }),
      count: 0,
      isToday: position === todayPosition,
      isPeak: false,
    };
  });
}

/**
 * The week with the server's per-day counts filled in. Days still ahead stay
 * at zero, so the chart keeps its seven columns. The busiest day is flagged
 * `isPeak` (the earliest one on a tie).
 */
export function withCounts(
  week: ActivityDay[],
  counts: OrganizerActivityDay[],
): ActivityDay[] {
  const byDate = new Map(counts.map((day) => [day.date, day.count]));
  const days = week.map((day) => ({
    ...day,
    count: byDate.get(day.key) ?? 0,
    isPeak: false,
  }));
  const peak = days.reduce<ActivityDay | null>(
    (best, day) => (day.count > (best?.count ?? 0) ? day : best),
    null,
  );
  if (peak) peak.isPeak = true;
  return days;
}
