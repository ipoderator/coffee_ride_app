'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  EmptyState,
  ErrorState,
  PARTICIPANTS_GROUP_TERMS,
  PARTICIPANTS_TERMS,
  Skeleton,
  formatDate,
  formatTime,
} from 'ui';
import {
  getRideGroups,
  getRideWaitlist,
  type RideParticipantSummary,
} from '../api';
import { formatGroupRef } from '../group-sections';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/organizer/rides/[id]/participants` (CR-037, `docs/design.md` §9's
 * `WaitlistTable`). `waiting` entries only, exact FIFO order — the array's own order
 * *is* each entry's queue position, same "no stored position column" reasoning
 * CR-036 established for `WaitlistEntry` itself. Same states/layout discipline as
 * `ParticipantTable`, deliberately not shared as one generic component — two named
 * components per `docs/design.md`'s own inventory.
 *
 * CR-120: stays one FIFO list (the queue order *is* the information here), with
 * a «Группа» field per entry — «Группа 1 · 25 км/ч», or «—» for an entry without
 * one — shown whenever the ride has groups.
 */
export function WaitlistTable({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<RideParticipantSummary[]>([]);
  const [rideHasGroups, setRideHasGroups] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    Promise.all([
      getRideWaitlist(rideId),
      getRideGroups(rideId).catch(() => null),
    ])
      .then(([response, groups]) => {
        if (cancelled) return;
        setItems(response.items);
        setRideHasGroups((groups?.length ?? 0) > 0);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId, attempt]);

  const showGroup = rideHasGroups || items.some((item) => item.group !== null);

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-medium text-text">
        {PARTICIPANTS_TERMS.waitlistSectionTitle}
      </p>

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          message={PARTICIPANTS_TERMS.loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {status === 'ready' && items.length === 0 && (
        <EmptyState
          title={PARTICIPANTS_TERMS.waitlistEmptyTitle}
          description={PARTICIPANTS_TERMS.waitlistEmptyDescription}
        />
      )}

      {status === 'ready' && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => {
            const joinedAt = new Date(item.createdAt);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-none last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="break-words text-sm font-medium text-text">
                    {index + 1}.{' '}
                    {item.displayName ?? PARTICIPANTS_TERMS.noNameFallback}
                  </p>
                  {showGroup && (
                    <p className="text-sm text-text-secondary">
                      {PARTICIPANTS_GROUP_TERMS.groupLabel}:{' '}
                      <span className="text-text">
                        {formatGroupRef(item.group)}
                      </span>
                    </p>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {PARTICIPANTS_TERMS.joinedAtLabel}: {formatDate(joinedAt)}{' '}
                  {formatTime(joinedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
