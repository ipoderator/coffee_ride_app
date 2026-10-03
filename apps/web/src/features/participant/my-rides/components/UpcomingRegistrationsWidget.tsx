'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MyRegistrationSummary } from 'types';
import {
  buttonClassName,
  Card,
  ErrorState,
  formatRideStartLine,
  PARTICIPANT_HOME_TERMS as T,
  RIDE_STATUS_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { listMyRegistrations } from '../api';

const LIMIT = 3;

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      items: MyRegistrationSummary[];
      cancelled: MyRegistrationSummary[];
    };

/**
 * CR-193: a cancelled ride whose date is still ahead. The API puts it in
 * history (`when=past`, owner QA: it is not «upcoming»), where `startsAt desc`
 * makes such rides lead the first page — so a page of `LIMIT` is enough to
 * keep the cancellation in sight here until its date has passed.
 */
function isCancelledAhead(item: MyRegistrationSummary, now: number): boolean {
  return (
    item.ride.status === 'cancelled' && Date.parse(item.ride.startsAt) >= now
  );
}

function RegistrationRows({ items }: { items: MyRegistrationSummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border border-y border-border">
      {items.map(({ registration, ride }) => {
        const status = RIDE_STATUS_TERMS[ride.status];
        return (
          <li key={registration.id} className="flex flex-col gap-1 py-3">
            <Link
              href={`/rides/${ride.id}`}
              className="line-clamp-2 font-medium text-text wrap-anywhere hover:underline"
            >
              {ride.title}
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-label text-text-secondary uppercase tabular-nums">
                {formatRideStartLine(new Date(ride.startsAt), {
                  timeZone: ride.startTimezone,
                })}
              </span>
              <StatusBadge label={status.label} tone={status.tone} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * `/me` (CR-185, UX handoff P2): the participant's next registrations — up to
 * three, soonest first (`GET /v1/registrations/mine?when=upcoming`), each a
 * link to its ride page, plus «Все регистрации» → `/me/rides`. Nothing booked
 * → a direct «Найти заезд» into the catalogue instead of a dead end.
 *
 * CR-193 (owner QA): cancelled and finished rides are no longer «upcoming»
 * (the API moved them to history), but a cancellation must not just vanish
 * from here — «Отменены организатором» lists the cancelled rides whose date
 * is still ahead, with their «Отменён» badge, under the next rides (or under
 * the empty state). Reading that is best-effort: if it fails, the widget
 * still shows the next rides.
 */
export function UpcomingRegistrationsWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    setState({ status: 'loading' });
    const now = Date.now();
    const upcoming = listMyRegistrations({ when: 'upcoming', limit: LIMIT });
    const cancelledAhead = listMyRegistrations({ when: 'past', limit: LIMIT })
      .then(({ items }) =>
        items
          .filter((item) => isCancelledAhead(item, now))
          .sort(
            (a, b) => Date.parse(a.ride.startsAt) - Date.parse(b.ride.startsAt),
          ),
      )
      .catch((): MyRegistrationSummary[] => []);
    Promise.all([upcoming, cancelledAhead])
      .then(([{ items }, cancelled]) => {
        if (!stale) setState({ status: 'ready', items, cancelled });
      })
      .catch(() => {
        if (!stale) setState({ status: 'error' });
      });
    return () => {
      stale = true;
    };
  }, [attempt]);

  return (
    <Card className="flex min-w-0 flex-col gap-4 rounded-2xl p-5 md:p-6">
      <p className="font-mono text-label text-text-secondary uppercase">
        {T.registrationsLabel}
      </p>
      {state.status === 'loading' ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-56 max-w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : state.status === 'error' ? (
        <ErrorState
          message={T.registrationsLoadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : (
        <>
          {state.items.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <h2 className="text-h3 text-text">{T.registrationsEmptyTitle}</h2>
              <p className="max-w-prose text-body-sm text-text-secondary">
                {T.registrationsEmptyDescription}
              </p>
              <Link href="/" className={buttonClassName()}>
                {T.findRide}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-text">{T.registrationsTitle}</h2>
              <RegistrationRows items={state.items} />
            </>
          )}
          {state.cancelled.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-label text-text-secondary uppercase">
                {T.cancelledLabel}
              </h3>
              <RegistrationRows items={state.cancelled} />
            </div>
          ) : null}
          {state.items.length > 0 || state.cancelled.length > 0 ? (
            <Link
              href="/me/rides"
              className="inline-flex min-h-11 items-center self-start text-body-sm font-medium text-primary hover:underline"
            >
              {T.allRegistrations} →
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );
}
