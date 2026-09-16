'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  EmptyState,
  ErrorState,
  PARTICIPANTS_TERMS,
  Skeleton,
  formatDate,
  formatTime,
} from 'ui';
import { getRideParticipants, type RideParticipantSummary } from '../api';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/organizer/rides/[id]/participants` (CR-037, `docs/design.md` §9's
 * `ParticipantTable`). Active registrations only, oldest first (server-side order —
 * see `registrations.service.ts`'s `listParticipants`). No "load more" UI —
 * `.claude/context/current-task.md`'s scope decision, same precedent `RidesList`/
 * `DiscoveryView` already set. Renders as stacked cards, never a table
 * (`docs/design.md` §11: participant lists collapse below `md`, never scroll
 * horizontally on a phone — built card-first from the start rather than retrofitted).
 */
export function ParticipantTable({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<RideParticipantSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    getRideParticipants(rideId)
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId]);

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-medium text-text">
        {PARTICIPANTS_TERMS.participantsSectionTitle}
      </p>

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState message={PARTICIPANTS_TERMS.loadError} />
      )}

      {status === 'ready' && items.length === 0 && (
        <EmptyState
          title={PARTICIPANTS_TERMS.participantsEmptyTitle}
          description={PARTICIPANTS_TERMS.participantsEmptyDescription}
        />
      )}

      {status === 'ready' && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const joinedAt = new Date(item.createdAt);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-none last:pb-0"
              >
                <p className="text-sm font-medium text-text">
                  {item.displayName ?? PARTICIPANTS_TERMS.noNameFallback}
                </p>
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
