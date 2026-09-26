'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  Card,
  cn,
  ErrorState,
  formatElapsedShort,
  PARTICIPANTS_TERMS,
  REGISTRATION_ACTIVITY_TERMS,
  Skeleton,
} from 'ui';
import {
  listAllRideParticipants,
  listOwnRidesPage,
} from '@/lib/organizer/own-rides';
import {
  type ActivityDay,
  type ActivityEntry,
  recentEntries,
  registrationsPerDay,
  selectActivityRides,
  toActivityEntries,
} from '../lib/activity';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      now: Date;
      recent: ActivityEntry[];
      days: ActivityDay[];
    };

function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * `/organizer` dashboard (CR-130, ADR-024 mockup «свежие записи и неделя по
 * дням»): the newest registrations across the organizer's current rides, and
 * a per-day count for the last week. Built entirely from existing endpoints —
 * `GET /v1/rides/mine` plus each selected ride's `GET .../participants`
 * (`createdAt` per registration), aggregated here; no new API surface
 * (`selectActivityRides` bounds the per-ride fetches).
 */
export function RegistrationActivityWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      const now = new Date();
      const rides = selectActivityRides(await listOwnRidesPage(), now);
      const perRide = await Promise.all(
        rides.map(async (ride) =>
          toActivityEntries(ride, await listAllRideParticipants(ride.id)),
        ),
      );
      const entries = perRide.flat();
      return {
        now,
        recent: recentEntries(entries),
        days: registrationsPerDay(entries, now, viewerTimeZone()),
      };
    })()
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', ...result });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'error') {
    return (
      <Card className="col-span-full">
        <ErrorState
          message={REGISTRATION_ACTIVITY_TERMS.loadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </Card>
    );
  }

  const isLoading = state.status === 'loading';

  return (
    <div
      className="col-span-full grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
      aria-busy={isLoading || undefined}
    >
      <Card className="flex flex-col gap-3 rounded-2xl p-5">
        <h2 className="font-display text-sm font-semibold tracking-[0.06em] text-text-secondary uppercase">
          {REGISTRATION_ACTIVITY_TERMS.recentTitle}
        </h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : state.recent.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {REGISTRATION_ACTIVITY_TERMS.recentEmpty}
          </p>
        ) : (
          <ul className="flex flex-col">
            {state.recent.map((entry) => (
              <RecentRow key={entry.id} entry={entry} now={state.now} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-[0.06em] text-text-secondary uppercase">
            {REGISTRATION_ACTIVITY_TERMS.perDayTitle}
          </h2>
          <span className="font-mono text-xs text-text-muted">
            {REGISTRATION_ACTIVITY_TERMS.perDayPeriod}
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <DayBars days={state.days} />
        )}
      </Card>
    </div>
  );
}

function RecentRow({ entry, now }: { entry: ActivityEntry; now: Date }) {
  const name = entry.displayName ?? PARTICIPANTS_TERMS.noNameFallback;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2 first:border-t-0">
      {/* Decorative: the name is right beside it, so the avatar's own
          `aria-label` would only make a screen reader read it twice. */}
      <span aria-hidden="true">
        <Avatar name={entry.displayName} size="sm" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-text">
          {name}
          {entry.groupName && (
            <span className="text-text-muted"> · {entry.groupName}</span>
          )}
        </p>
        <p className="truncate text-xs text-text-muted">{entry.rideTitle}</p>
      </div>
      <time
        dateTime={entry.createdAt.toISOString()}
        className="font-mono text-xs text-text-muted tabular-nums"
      >
        {formatElapsedShort(entry.createdAt, now)}
      </time>
    </li>
  );
}

/**
 * The count is printed above every bar and each day carries a full sentence
 * for screen readers (`docs/design.md` §12: the bar height and the peak
 * day's highlight colour only reinforce the text, never replace it). Today's
 * weekday label is set in the body text colour so the week reads left to
 * right up to «now».
 */
function DayBars({ days }: { days: ActivityDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  return (
    <ol className="flex h-36 items-end gap-1.5">
      {days.map((day) => (
        <li
          key={day.key}
          className="flex h-full flex-1 flex-col items-center justify-end gap-1"
        >
          <span className="sr-only">
            {REGISTRATION_ACTIVITY_TERMS.dayBar(
              day.isToday ? REGISTRATION_ACTIVITY_TERMS.today : day.weekday,
              day.count,
            )}
          </span>
          <span
            aria-hidden="true"
            className="font-num text-sm font-bold text-text-secondary tabular-nums"
          >
            {day.count}
          </span>
          <span aria-hidden="true" className="flex w-full flex-1 items-end">
            <span
              className={cn(
                'block w-full rounded-t-md rounded-b-sm',
                day.isPeak ? 'bg-brand' : 'bg-primary-tint',
              )}
              // A zero day keeps a 2px stub so the axis still reads as seven days.
              style={{
                height: day.count === 0 ? '2px' : `${(day.count / max) * 100}%`,
              }}
            />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'font-mono text-xs',
              day.isToday ? 'font-semibold text-text' : 'text-text-muted',
            )}
          >
            {day.weekday}
          </span>
        </li>
      ))}
    </ol>
  );
}
