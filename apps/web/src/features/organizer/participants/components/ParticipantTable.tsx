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
  getRideParticipants,
  type RideGroupSummary,
  type RideParticipantSummary,
} from '../api';
import { buildGroupSections, formatGroupRef } from '../group-sections';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/organizer/rides/[id]/participants` (CR-037, `docs/design.md` §9's
 * `ParticipantTable`). Active registrations only, oldest first (server-side order —
 * see `registrations.service.ts`'s `listParticipants`). No "load more" UI —
 * `.claude/context/current-task.md`'s scope decision, same precedent `RidesList`/
 * `DiscoveryView` already set. Renders as stacked cards, never a table
 * (`docs/design.md` §11: participant lists collapse below `md`, never scroll
 * horizontally on a phone — built card-first from the start rather than retrofitted).
 *
 * CR-120: when the ride has pace groups, the list is split under one heading per
 * group (organizer's order, with a count) plus «Без группы» for anyone without
 * one; a ride without groups keeps the flat list. The groups come from
 * `GET /v1/rides/:id` — if that one call fails, the participants still render,
 * grouped by what the items themselves reference.
 */
export function ParticipantTable({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<RideParticipantSummary[]>([]);
  const [rideGroups, setRideGroups] = useState<RideGroupSummary[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    Promise.all([
      getRideParticipants(rideId),
      getRideGroups(rideId).catch(() => null),
    ])
      .then(([response, groups]) => {
        if (cancelled) return;
        setItems(response.items);
        setRideGroups(groups);
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

  const sections =
    status === 'ready' ? buildGroupSections(items, rideGroups) : null;

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
        <ErrorState
          message={PARTICIPANTS_TERMS.loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {status === 'ready' && items.length === 0 && (
        <EmptyState
          title={PARTICIPANTS_TERMS.participantsEmptyTitle}
          description={PARTICIPANTS_TERMS.participantsEmptyDescription}
        />
      )}

      {status === 'ready' && items.length > 0 && sections === null && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ParticipantRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {status === 'ready' && items.length > 0 && sections !== null && (
        <div className="flex flex-col gap-6">
          {sections.map((section) => {
            const headingId = `participants-group-${section.group?.id ?? 'none'}`;
            return (
              <section
                key={section.group?.id ?? 'none'}
                aria-labelledby={headingId}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-[1.5px] border-frame pb-2">
                  <h2
                    id={headingId}
                    className="text-base font-semibold text-text"
                  >
                    {section.group
                      ? formatGroupRef(section.group)
                      : PARTICIPANTS_GROUP_TERMS.ungroupedHeading}
                  </h2>
                  <p className="text-sm tabular-nums text-text-secondary">
                    {PARTICIPANTS_GROUP_TERMS.participantsCount(
                      section.items.length,
                    )}
                  </p>
                </div>
                {section.items.length > 0 && (
                  <ul className="flex flex-col gap-3">
                    {section.items.map((item) => (
                      <ParticipantRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ParticipantRow({ item }: { item: RideParticipantSummary }) {
  const joinedAt = new Date(item.createdAt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-none last:pb-0">
      <p className="min-w-0 break-words text-sm font-medium text-text">
        {item.displayName ?? PARTICIPANTS_TERMS.noNameFallback}
      </p>
      <p className="text-sm text-text-secondary">
        {PARTICIPANTS_TERMS.joinedAtLabel}: {formatDate(joinedAt)}{' '}
        {formatTime(joinedAt)}
      </p>
    </li>
  );
}
