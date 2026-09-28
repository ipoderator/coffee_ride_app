'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RideGroupRef, RideGroupSummary, RideRider } from 'types';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  formatGroupPace,
  RIDE_DETAIL_RIDERS_TERMS,
  RIDE_POSTER_TERMS,
  Skeleton,
} from 'ui';
import { loginHref } from '@/lib/auth/next-path';
import { useSession } from '@/lib/auth/session-context';
import { ApiError, getRideRiders } from '../api';

type RidersStatus = 'loading' | 'ready' | 'anonymous' | 'hidden' | 'error';

interface RiderBucket {
  key: string;
  group: RideGroupRef | null;
  count: number;
  riders: { registrationId: string; displayName: string | null }[];
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
      riders: [],
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
    riders: [],
  };
  for (const rider of riders) {
    if (!rider.group) {
      ungrouped.riders.push(rider);
      continue;
    }
    let bucket = buckets.get(rider.group.id);
    if (!bucket) {
      // A group the ride payload didn't list (created/renamed between the two
      // requests) — still show its riders rather than dropping them.
      bucket = {
        key: rider.group.id,
        group: rider.group,
        count: 0,
        riders: [],
      };
      buckets.set(rider.group.id, bucket);
    }
    bucket.riders.push(rider);
  }
  // Headings only for what is actually loaded; a count never reads lower than
  // the rows shown under it.
  return [...buckets.values(), ungrouped]
    .filter((bucket) => bucket.riders.length > 0)
    .map((bucket) => ({
      ...bucket,
      count: Math.max(bucket.count, bucket.riders.length),
    }));
}

function RiderNames({
  riders,
  rideId,
}: {
  riders: { registrationId: string; displayName: string | null }[];
  rideId: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {riders.map((rider) => (
        // CR-126: `registrationId` is an opaque id — not a user id — that only
        // unlocks the access-gated rider-profile route below, itself gated by
        // the profile owner's own privacy setting. Safe to link to directly.
        <li key={rider.registrationId} className="py-2 text-body">
          <Link
            href={`/rides/${rideId}/riders/${rider.registrationId}`}
            className={
              rider.displayName
                ? 'text-text underline decoration-1 underline-offset-2 hover:text-primary'
                : 'text-text-secondary underline decoration-1 underline-offset-2 hover:text-primary'
            }
          >
            {rider.displayName ?? RIDE_DETAIL_RIDERS_TERMS.noName}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const AVATAR_COUNT = 7;

/**
 * CR-151: the first riders as an overlapping avatar stack (after 21st
 * cnippet-dev/avatar-stack) — initials only (a rider's photo is behind their
 * own profile's privacy setting), each a link to that rider's card with the
 * name as a hover/focus tooltip. The full named list stays one click away.
 */
function RiderAvatars({
  riders,
  rideId,
}: {
  riders: { registrationId: string; displayName: string | null }[];
  rideId: string;
}) {
  return (
    <ul className="flex items-center" data-testid="riders-avatars">
      {riders.map((rider) => {
        const name = rider.displayName ?? RIDE_DETAIL_RIDERS_TERMS.noName;
        return (
          <li key={rider.registrationId} className="-ml-2.5 first:ml-0">
            <Link
              href={`/rides/${rideId}/riders/${rider.registrationId}`}
              data-name={name}
              className="relative block rounded-full ring-2 ring-bg transition-transform after:pointer-events-none after:absolute after:bottom-[calc(100%+8px)] after:left-1/2 after:-translate-x-1/2 after:rounded-lg after:bg-text after:px-2 after:py-1 after:text-xs after:font-medium after:whitespace-nowrap after:text-bg after:opacity-0 after:transition-opacity after:content-[attr(data-name)] hover:z-10 hover:-translate-y-[3px] hover:after:opacity-100 focus-visible:z-10 focus-visible:-translate-y-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:after:opacity-100 motion-reduce:transition-none"
            >
              <Avatar
                name={rider.displayName}
                size="md"
                className="size-11 bg-primary-tint text-body-sm font-semibold text-primary"
              />
              {rider.displayName ? null : (
                <span className="sr-only">{name}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * CR-119: «Участники» — who else is riding (`GET /v1/rides/:id/riders`, CR-117).
 * Signed-in viewers see names (CR-125: first + last name when set, else the
 * free-text display name) grouped by pace group; anonymous visitors see only the
 * count plus a sign-in link (product decision: a named list of people at a
 * dated, located event is not public). The session hint from `SessionProvider`
 * avoids a guaranteed-401 request for an anonymous visitor; a 401 from the
 * endpoint itself (expired session) lands in the same prompt.
 *
 * CR-125: the organizer can turn the whole list off per ride
 * (`Ride.participantsVisible`); the endpoint then answers every signed-in
 * caller with `403 riders_hidden`, shown as a neutral notice instead of the
 * sign-in prompt — the count on the page above this section is unaffected.
 *
 * CR-141: the sign-in link returns to this ride (`/login?next=`).
 */
export function RidersSection({
  rideId,
  registrationsCount,
  participantLimit = null,
  groups,
  version,
}: {
  rideId: string;
  registrationsCount: number;
  /** CR-151: «17 из 24» in the heading when the ride has a limit. */
  participantLimit?: number | null;
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
  const [isExpanded, setIsExpanded] = useState(false);

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
        if (error instanceof ApiError && error.problem.status === 401) {
          setStatus('anonymous');
        } else if (
          error instanceof ApiError &&
          error.problem.code === 'riders_hidden'
        ) {
          setStatus('hidden');
        } else {
          setStatus('error');
        }
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
    <section className="flex flex-col gap-3.5" aria-labelledby="ride-riders">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ride-riders" className="text-h2 text-text">
          {RIDE_POSTER_TERMS.ridersTitle}
        </h2>
        <p className="text-body-sm text-text-secondary tabular-nums">
          {participantLimit !== null
            ? RIDE_POSTER_TERMS.ridersOf(registrationsCount, participantLimit)
            : RIDE_DETAIL_RIDERS_TERMS.ridersCount(registrationsCount)}
        </p>
      </div>

      {groups.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="riders-group-split">
          {groups.map((group) => (
            <li
              key={group.id}
              className="rounded-full bg-surface px-2.5 py-0.5 text-body-sm text-text-secondary tabular-nums"
            >
              <b className="font-semibold text-text">{group.name}</b> ·{' '}
              {formatGroupPace(group.paceKmh)} — {group.registrationsCount}
            </li>
          ))}
        </ul>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-48" />
        </div>
      )}

      {status === 'anonymous' && registrationsCount > 0 && (
        <p className="text-body-sm text-text-secondary">
          <Link
            href={loginHref(`/rides/${rideId}`)}
            className="font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover"
          >
            {RIDE_DETAIL_RIDERS_TERMS.signInPrompt}
          </Link>
        </p>
      )}

      {status === 'hidden' && (
        <p className="text-body-sm text-text-secondary">
          {RIDE_DETAIL_RIDERS_TERMS.hiddenByOrganizer}
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
        <RiderAvatars riders={riders.slice(0, AVATAR_COUNT)} rideId={rideId} />
      )}

      {status === 'ready' && riders.length > 0 && (
        <Button
          variant="secondary"
          className="min-h-11 self-start border-0 px-0 text-body-sm font-medium text-primary hover:bg-transparent hover:text-primary-hover"
          aria-expanded={isExpanded}
          aria-controls="ride-riders-list"
          onClick={() => setIsExpanded((open) => !open)}
        >
          {isExpanded
            ? RIDE_POSTER_TERMS.hideAllRiders
            : RIDE_POSTER_TERMS.showAllRiders}
        </Button>
      )}

      {status === 'ready' && riders.length > 0 && isExpanded && (
        <div id="ride-riders-list" className="flex flex-col gap-4">
          {showGroupHeadings ? (
            buckets.map((bucket) => (
              <div key={bucket.key} className="flex flex-col gap-1">
                <h3 className="border-b border-frame pb-1 font-mono text-label text-text uppercase tabular-nums">
                  {bucket.group
                    ? RIDE_DETAIL_RIDERS_TERMS.groupHeading(
                        bucket.group.name,
                        formatGroupPace(bucket.group.paceKmh),
                        bucket.count,
                      )
                    : `${RIDE_DETAIL_RIDERS_TERMS.noGroup} — ${bucket.count}`}
                </h3>
                <RiderNames riders={bucket.riders} rideId={rideId} />
              </div>
            ))
          ) : (
            <RiderNames riders={riders} rideId={rideId} />
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
