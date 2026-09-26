'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  buttonClassName,
  EmptyState,
  ErrorState,
  ORGANIZER_NEAREST_RIDE_TERMS,
  Skeleton,
} from 'ui';
import { fetchNearestOwnRide } from '@/lib/organizer/own-rides';

type State = { status: 'loading' } | { status: 'none' } | { status: 'error' };

/**
 * CR-131 (owner decision, option «б»): the organizer sidebar's «Участники» and
 * «Обновления» have no cross-ride screens behind them — participants and
 * updates live on each ride — so their routes open the nearest ride's page
 * (`lib/organizer/own-rides`'s shared definition) with `router.replace`,
 * keeping the redirect out of the back-button history. No upcoming ride →
 * an empty state pointing at the ride list, never a dead end.
 */
export function NearestRideRedirect({
  target,
  title,
}: {
  /** The per-ride sub-page to open: `/organizer/rides/<id>/<target>`. */
  target: 'participants' | 'updates';
  /** The page's heading (the sidebar item's label). */
  title: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchNearestOwnRide()
      .then((ride) => {
        if (cancelled) return;
        if (ride) router.replace(`/organizer/rides/${ride.id}/${target}`);
        else setState({ status: 'none' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, router, target]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      {state.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <p className="sr-only">{ORGANIZER_NEAREST_RIDE_TERMS.opening}</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {state.status === 'error' && (
        <ErrorState
          message={ORGANIZER_NEAREST_RIDE_TERMS.loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}
      {state.status === 'none' && (
        <EmptyState
          title={ORGANIZER_NEAREST_RIDE_TERMS.noRideTitle}
          description={ORGANIZER_NEAREST_RIDE_TERMS.noRideDescription}
          action={
            <Link
              href="/organizer/rides"
              className={buttonClassName('secondary')}
            >
              {ORGANIZER_NEAREST_RIDE_TERMS.allRidesLink}
            </Link>
          }
        />
      )}
    </div>
  );
}
