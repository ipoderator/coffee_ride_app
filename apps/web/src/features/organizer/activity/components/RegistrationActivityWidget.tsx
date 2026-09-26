'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  Card,
  cn,
  ErrorState,
  formatElapsedShort,
  formatShortPersonName,
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
              <RecentRow
                key={entry.id}
                entry={entry}
                now={state.now}
                showRide={spansSeveralRides(state.recent)}
              />
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

/** Whether the listed entries belong to more than one ride — only then does
 * a row need to name its ride (the mockup lists one ride's sign-ups). */
function spansSeveralRides(entries: ActivityEntry[]): boolean {
  return new Set(entries.map((entry) => entry.rideTitle)).size > 1;
}

// CR-132: the mockup's avatars are plain pastel discs in varied tints; these
// are existing tokens (lilac/green/gold in the dark theme), picked stably per
// registration so a row keeps its colour between visits.
const AVATAR_TINTS = ['bg-brand', 'bg-success', 'bg-elevation'] as const;

function avatarTint(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}

/**
 * CR-132 (mockup screen 4): «Анна К. · группа 1» on one line with the time
 * at the right — a short name (the full one is a click away in the
 * participant list), the pace group and, only when the feed spans several
 * rides, the ride's title in the mono face.
 */
function RecentRow({
  entry,
  now,
  showRide,
}: {
  entry: ActivityEntry;
  now: Date;
  showRide: boolean;
}) {
  const name =
    formatShortPersonName(entry.displayName) ??
    PARTICIPANTS_TERMS.noNameFallback;
  const meta = [entry.groupName, showRide ? entry.rideTitle : null].filter(
    (part): part is string => Boolean(part),
  );
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-1">
      {/* Decorative: the name is right beside it, so the avatar's own
          `aria-label` would only make a screen reader read it twice. */}
      <span aria-hidden="true">
        <Avatar
          name={entry.displayName}
          size="sm"
          className={cn('size-9 text-bg', avatarTint(entry.id))}
        />
      </span>
      <p className="min-w-0 truncate">
        <span className="text-base text-text">{name}</span>
        {meta.map((part) => (
          <span key={part} className="font-mono text-sm text-text-muted">
            {' · '}
            {part}
          </span>
        ))}
      </p>
      <time
        dateTime={entry.createdAt.toISOString()}
        className="font-mono text-sm text-text-muted tabular-nums"
      >
        {formatElapsedShort(entry.createdAt, now)}
      </time>
    </li>
  );
}

/**
 * CR-132 (mockup screen 4): bars only — no printed counts; each day carries
 * a full sentence for screen readers (`docs/design.md` §12: the height and
 * the peak day's highlight only reinforce that text), and a zero day keeps a
 * short stub so the axis still reads as seven days. Today's weekday label is
 * set in the body text colour so the week reads left to right up to «now».
 */
function DayBars({ days }: { days: ActivityDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  return (
    <ol className="flex h-36 items-end gap-2">
      {days.map((day) => (
        <li
          key={day.key}
          className="flex h-full flex-1 flex-col items-center justify-end gap-2"
        >
          <span className="sr-only">
            {REGISTRATION_ACTIVITY_TERMS.dayBar(
              day.isToday ? REGISTRATION_ACTIVITY_TERMS.today : day.weekday,
              day.count,
            )}
          </span>
          <span aria-hidden="true" className="flex w-full flex-1 items-end">
            <span
              className={cn(
                'block w-full rounded-md',
                day.isPeak ? 'bg-brand' : 'bg-primary-tint',
              )}
              style={{
                height:
                  day.count === 0
                    ? '0.375rem'
                    : `max(0.375rem, ${(day.count / max) * 100}%)`,
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
