'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RideGroupRef, RideGroupSummary, RideRider } from 'types';
import {
  Button,
  EmptyState,
  ErrorState,
  formatGroupPace,
  RIDE_DETAIL_RIDERS_TERMS,
  Skeleton,
} from 'ui';
import { useSession } from '@/lib/auth/session-context';
import { ApiError, getRideRiders } from '../api';

type RidersStatus = 'loading' | 'ready' | 'anonymous' | 'error';

interface RiderBucket {
  key: string;
  group: RideGroupRef | null;
  count: number;
  names: (string | null)[];
}

/**
 * Buckets loaded riders by group, in the ride's own group order, riders with no
 * group last under «Без группы». A heading's count is the group's live total
 * from `GET /v1/rides/:id` (`groups[].registrationsCount`), not just the rows
 * loaded so far — the list is paginated, the number shouldn't jump as it loads.
 */
function bucketRiders(
  riders: RideRider[],
  groups: RideGroupSummary[],
  registrationsCount: number,
): RiderBucket[] {
  const buckets = new Map<string, RiderBucket>();
  for (const group of groups) {
    buckets.set(group.id, {
      key: group.id,
      group,
      count: group.registrationsCount,
      names: [],
    });
  }
  const ungrouped: RiderBucket = {
    key: 'none',
    group: null,
    // Everyone not counted in a group — known up front, same reason as above.
    count: Math.max(
      registrationsCount -
        groups.reduce((sum, group) => sum + group.registrationsCount, 0),
      0,
    ),
    names: [],
  };
  for (const rider of riders) {
    if (!rider.group) {
      ungrouped.names.push(rider.displayName);
      continue;
    }
    let bucket = buckets.get(rider.group.id);
    if (!bucket) {
      // A group the ride payload didn't list (created/renamed between the two
      // requests) — still show its riders rather than dropping them.
      bucket = { key: rider.group.id, group: rider.group, count: 0, names: [] };
      buckets.set(rider.group.id, bucket);
    }
    bucket.names.push(rider.displayName);
  }
  // Headings only for what is actually loaded; a count never reads lower than
  // the rows shown under it.
  return [...buckets.values(), ungrouped]
    .filter((bucket) => bucket.names.length > 0)
    .map((bucket) => ({
      ...bucket,
      count: Math.max(bucket.count, bucket.names.length),
    }));
}

function RiderNames({ names }: { names: (string | null)[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {names.map((name, index) => (
        <li
          // Riders carry no id by design (`docs/api.md`: no user/registration
          // id in this payload) — position within the loaded list is stable.
          key={index}
          className={
            name
              ? 'py-2 text-base text-text'
              : 'py-2 text-base text-text-secondary'
          }
        >
          {name ?? RIDE_DETAIL_RIDERS_TERMS.noName}
        </li>
      ))}
    </ul>
  );
}

/**
 * CR-119: «Участники» — who else is riding (`GET /v1/rides/:id/riders`, CR-117).
 * Signed-in viewers see display names grouped by pace group; anonymous visitors
 * see only the count plus a sign-in link (product decision: a named list of
 * people at a dated, located event is not public). The session hint from
 * `SessionProvider` avoids a guaranteed-401 request for an anonymous visitor; a
 * 401 from the endpoint itself (expired session) lands in the same prompt.
 *
 * `/login` has no `?next=` redirect support yet, so the link is a plain one.
 */
export function RidersSection({
  rideId,
  registrationsCount,
  groups,
  version,
}: {
  rideId: string;
  registrationsCount: number;
  groups: RideGroupSummary[];
  /** Bumped by the page after the viewer's own registration changes. */
  version: number;
}) {
  const session = useSession();
  const sessionStatus = session.status;
  // Anonymous already known → no skeleton flash before the prompt.
  const [status, setStatus] = useState<RidersStatus>(() =>
    sessionStatus === 'anonymous' ? 'anonymous' : 'loading',
  );
  const [riders, setRiders] = useState<RideRider[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus === 'anonymous') {
      setStatus('anonymous');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getRideRiders(rideId)
      .then((response) => {
        if (cancelled) return;
        setRiders(response.items);
        setNextCursor(response.nextCursor);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(
          error instanceof ApiError && error.problem.status === 401
            ? 'anonymous'
            : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, sessionStatus, version, attempt]);

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const response = await getRideRiders(rideId, nextCursor);
      setRiders((current) => [...current, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const buckets =
    status === 'ready' ? bucketRiders(riders, groups, registrationsCount) : [];
  const showGroupHeadings = groups.length > 0 || buckets.some((b) => b.group);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ride-riders">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="ride-riders"
          className="font-display text-xl font-semibold text-text"
        >
          {RIDE_DETAIL_RIDERS_TERMS.sectionTitle}
        </h2>
        <p className="text-sm text-text-secondary tabular-nums">
          {RIDE_DETAIL_RIDERS_TERMS.ridersCount(registrationsCount)}
        </p>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-48" />
        </div>
      )}

      {status === 'anonymous' && registrationsCount > 0 && (
        <p className="text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover"
          >
            {RIDE_DETAIL_RIDERS_TERMS.signInPrompt}
          </Link>
        </p>
      )}

      {status === 'error' && (
        <ErrorState
          message={RIDE_DETAIL_RIDERS_TERMS.loadError}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {((status === 'ready' && riders.length === 0) ||
        (status === 'anonymous' && registrationsCount === 0)) && (
        <EmptyState
          title={RIDE_DETAIL_RIDERS_TERMS.emptyTitle}
          description={RIDE_DETAIL_RIDERS_TERMS.emptyDescription}
        />
      )}

      {status === 'ready' && riders.length > 0 && (
        <div className="flex flex-col gap-4">
          {showGroupHeadings ? (
            buckets.map((bucket) => (
              <div key={bucket.key} className="flex flex-col gap-1">
                <h3 className="border-b border-frame pb-1 font-display text-sm font-semibold tracking-[0.04em] text-text uppercase tabular-nums">
                  {bucket.group
                    ? RIDE_DETAIL_RIDERS_TERMS.groupHeading(
                        bucket.group.name,
                        formatGroupPace(bucket.group.paceKmh),
                        bucket.count,
                      )
                    : `${RIDE_DETAIL_RIDERS_TERMS.noGroup} — ${bucket.count}`}
                </h3>
                <RiderNames names={bucket.names} />
              </div>
            ))
          ) : (
            <RiderNames names={riders.map((rider) => rider.displayName)} />
          )}
          {loadMoreFailed && (
            <ErrorState
              message={RIDE_DETAIL_RIDERS_TERMS.loadError}
              variant="inline"
              onRetry={loadMore}
            />
          )}
          {nextCursor && (
            <Button
              variant="secondary"
              className="self-start"
              isLoading={isLoadingMore}
              onClick={loadMore}
            >
              {RIDE_DETAIL_RIDERS_TERMS.showMore}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
