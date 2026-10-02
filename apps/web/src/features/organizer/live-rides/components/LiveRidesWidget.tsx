'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Ride, RideParticipantSummary } from 'types';
import {
  Avatar,
  buttonClassName,
  Card,
  cn,
  ErrorState,
  formatShortPersonName,
  formatShortStart,
  formatTime,
  ORGANIZER_LIVE_TERMS as T,
  Skeleton,
} from 'ui';
import { confirmFinish, listOwnRides, listRideParticipants } from '../api';
import {
  finishTally,
  liveRides,
  overdueRides,
  previewRows,
  resolvedCount,
  type RowState,
  upcomingRides,
} from '../lib/live-rides';

const MAX_UPCOMING = 3;
const MAX_ROWS = 3;

// CR-185 (handoff P2): a ride row never pushes the page wider than the
// screen. Phone: the title (up to two lines) on its own, the date and the
// action on the line below; from `md`, the action moves up beside the title.
const ROW_CLASSNAME =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3';
const ROW_TITLE_CLASSNAME =
  'col-span-2 line-clamp-2 font-medium text-text wrap-anywhere md:col-span-1';
const ROW_META_CLASSNAME = 'text-sm text-text-secondary';
const ROW_ACTION_CLASSNAME =
  'inline-flex min-h-11 items-center justify-self-end text-sm font-medium text-primary hover:underline md:col-start-2 md:row-span-2 md:row-start-1';

interface LiveEntry {
  ride: Ride;
  participants: RideParticipantSummary[];
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      live: LiveEntry[];
      overdue: Ride[];
      upcoming: Ride[];
    };

const DOT: Record<RowState, string> = {
  claimed: 'bg-warning',
  onRoute: 'bg-brand',
  confirmed: 'bg-success',
  dnf: 'bg-text-muted',
};
const LABEL: Record<RowState, string> = {
  claimed: T.stateClaimed,
  onRoute: T.stateOnRoute,
  confirmed: T.stateConfirmed,
  dnf: T.stateDnf,
};

function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 rounded-full', className)}
    />
  );
}

function LiveRideCard({
  entry,
  onConfirmed,
}: {
  entry: LiveEntry;
  onConfirmed: () => void;
}) {
  const { ride, participants } = entry;
  const tally = finishTally(participants);
  const total = participants.length;
  const rows = previewRows(participants, MAX_ROWS);
  const undecided = tally.claimed + tally.onRoute;
  const hidden = Math.max(
    undecided -
      rows.filter((r) => r.state === 'claimed' || r.state === 'onRoute').length,
    0,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timeZone = ride.startTimezone;

  async function confirm(registrationId: string) {
    setPending(registrationId);
    setFailed(false);
    try {
      await confirmFinish(ride.id, registrationId);
      onConfirmed();
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  // CR-184: every active registration lands in exactly one segment, so the
  // bar never reads as full while no-shows are left out of it.
  const segments: { count: number; className: string; label: string }[] = [
    {
      count: tally.confirmed,
      className: 'bg-success',
      label: T.legendConfirmed,
    },
    { count: tally.claimed, className: 'bg-warning', label: T.legendClaimed },
    { count: tally.onRoute, className: 'bg-brand', label: T.legendOnRoute },
    { count: tally.dnf, className: 'bg-text-muted', label: T.legendDnf },
    {
      count: tally.noShow,
      className: 'bg-text-muted/40',
      label: T.legendNoShow,
    },
  ];

  return (
    <Card className="gap-5 rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/organizer/rides/${ride.id}/edit`}
            className="font-title text-h3 text-text wrap-anywhere hover:underline"
          >
            {ride.title}
          </Link>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
          <Dot className="bg-success" />
          {T.liveBadge}
        </span>
      </div>

      <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
        <span>
          {T.startLabel}{' '}
          <span className="text-text">
            {formatTime(new Date(ride.startsAt), { timeZone })}
          </span>
        </span>
        <span>
          {T.listedLabel}{' '}
          <span className="text-text">{T.participantsCount(total)}</span>
        </span>
        {ride.distanceKm !== null && (
          <span>
            {T.formatLabel}{' '}
            <span className="text-text">{ride.distanceKm}&nbsp;км</span>
          </span>
        )}
      </p>

      {total === 0 ? (
        <p className="text-sm text-text-secondary">{T.noParticipants}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium text-text">{T.finishControl}</p>
            <p className="tabular-nums text-text">
              {T.confirmedOf(tally.confirmed, total)}
            </p>
          </div>
          <div
            role="img"
            aria-label={T.confirmedOf(tally.confirmed, total)}
            className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-border"
          >
            {segments.map(
              (segment, index) =>
                segment.count > 0 && (
                  <span
                    key={index}
                    className={segment.className}
                    style={{ flexGrow: segment.count }}
                  />
                ),
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-secondary">
            {segments.map((segment) => (
              <li key={segment.label} className="flex items-center gap-2">
                <Dot className={segment.className} />
                <span className="tabular-nums">{segment.count}</span>{' '}
                {segment.label}
              </li>
            ))}
          </ul>
          <p className="text-sm tabular-nums text-text-secondary">
            {T.resolvedOf(resolvedCount(tally), total)}
          </p>

          <ul className="divide-y divide-border border-t border-border">
            {rows.map(({ item, state }) => (
              <li
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Avatar name={item.displayName ?? ''} size="md" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text">
                    {formatShortPersonName(item.displayName) ?? '—'}
                  </span>
                  {state === 'claimed' && item.finishClaimedAt && (
                    <span className="text-sm text-text-secondary">
                      {T.claimedAt(
                        formatTime(new Date(item.finishClaimedAt), {
                          timeZone,
                        }),
                      )}
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-2 text-sm text-text max-md:col-start-2">
                  <Dot className={DOT[state]} />
                  {LABEL[state]}
                </span>
                {state === 'claimed' ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void confirm(item.id)}
                    className={buttonClassName('secondary')}
                  >
                    {T.confirm}
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
          {failed && (
            <p role="alert" className="text-sm text-danger">
              {T.confirmError}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-text-secondary">
          {hidden > 0 ? T.moreWithoutStatus(hidden) : ''}
        </p>
        <Link
          href={`/organizer/rides/${ride.id}/participants`}
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          {T.openParticipants} →
        </Link>
      </div>
    </Card>
  );
}

/**
 * `/organizer` dashboard (ADR-024 mockup screen 4): the organizer's rides
 * under way with the finish control (CR-181 claims, one-click confirm), the
 * rides whose start passed without being started (CR-184, «Требует решения»),
 * and the published rides still to come — in that order (CR-185 handoff: the
 * started ride is the first working block). Existing endpoints only: `/rides/mine`
 * and each live ride's `/participants`.
 */
export function LiveRidesWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<State> => {
      const rides = await listOwnRides();
      const live = await Promise.all(
        liveRides(rides).map(async (ride) => ({
          ride,
          participants: await listRideParticipants(ride.id),
        })),
      );
      const now = new Date();
      return {
        status: 'ready',
        live,
        overdue: overdueRides(rides, now),
        upcoming: upcomingRides(rides, now, MAX_UPCOMING),
      };
    })()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="col-span-full flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <Card className="col-span-full">
        <ErrorState message={T.loadError} variant="inline" onRetry={reload} />
      </Card>
    );
  }

  const { live, overdue, upcoming } = state;
  if (live.length === 0 && overdue.length === 0 && upcoming.length === 0) {
    return null;
  }

  return (
    <div className="col-span-full flex flex-col gap-6">
      {live.length > 0 && (
        <section
          aria-labelledby="live-rides-title"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="live-rides-title"
              className="font-mono text-label text-text uppercase"
            >
              {T.liveTitle}
            </h2>
            <p className="flex items-center gap-2 font-mono text-label text-success uppercase">
              <Dot className="bg-success" />
              {T.liveCount(live.length)}
            </p>
          </div>
          {live.map((entry) => (
            <LiveRideCard
              key={entry.ride.id}
              entry={entry}
              onConfirmed={reload}
            />
          ))}
        </section>
      )}

      {overdue.length > 0 && (
        <section
          aria-labelledby="attention-rides-title"
          className="flex flex-col gap-3"
        >
          <h2
            id="attention-rides-title"
            className="flex items-center gap-2 font-mono text-label text-warning uppercase"
          >
            <Dot className="bg-warning" />
            {T.attentionTitle}
          </h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {overdue.map((ride) => (
              <li key={ride.id} className={ROW_CLASSNAME}>
                <span className={ROW_TITLE_CLASSNAME}>{ride.title}</span>
                <span className={ROW_META_CLASSNAME}>
                  {T.overdueStart(
                    formatShortStart(new Date(ride.startsAt), {
                      timeZone: ride.startTimezone,
                    }),
                  )}
                </span>
                <Link
                  href={`/organizer/rides/${ride.id}/edit`}
                  className={ROW_ACTION_CLASSNAME}
                >
                  {T.overdueAction} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section
          aria-labelledby="upcoming-rides-title"
          className="flex flex-col gap-3"
        >
          <h2
            id="upcoming-rides-title"
            className="font-mono text-label text-text uppercase"
          >
            {T.upcomingTitle}
          </h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {upcoming.map((ride) => (
              <li key={ride.id} className={ROW_CLASSNAME}>
                <Link
                  href={`/organizer/rides/${ride.id}/edit`}
                  className={cn(ROW_TITLE_CLASSNAME, 'hover:underline')}
                >
                  {ride.title}
                </Link>
                <span className={ROW_META_CLASSNAME}>
                  {formatShortStart(new Date(ride.startsAt), {
                    timeZone: ride.startTimezone,
                  })}
                </span>
                <Link
                  href={`/organizer/rides/${ride.id}/participants`}
                  className={ROW_ACTION_CLASSNAME}
                >
                  {T.openParticipants} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
