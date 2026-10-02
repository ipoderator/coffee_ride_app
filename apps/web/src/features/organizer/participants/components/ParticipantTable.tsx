'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RegistrationAttendance, RideStatus } from 'types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FINISH_CHECKIN_TERMS,
  PARTICIPANTS_GROUP_TERMS,
  PARTICIPANTS_TERMS,
  Skeleton,
  StatusBadge,
  formatDate,
  formatTime,
  useToast,
} from 'ui';
import {
  confirmClaimedFinishes,
  getRideGroups,
  getRideParticipants,
  getRideStatus,
  setAttendance,
  type RideGroupSummary,
  type RideParticipantSummary,
} from '../api';
import { attendanceCounts, isAttendanceOpen } from '../attendance';
import { riderProfileHref } from '@/lib/rides/rider-profile-href';
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
  const [rideStatus, setRideStatus] = useState<RideStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    Promise.all([
      getRideParticipants(rideId),
      getRideGroups(rideId).catch(() => null),
      // CR-181: without a status the finish check-in simply stays hidden.
      getRideStatus(rideId).catch(() => null),
    ])
      .then(([response, groups, status]) => {
        if (cancelled) return;
        setItems(response.items);
        setRideGroups(groups);
        setRideStatus(status);
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

  const attendanceOpen = rideStatus !== null && isAttendanceOpen(rideStatus);
  const counts = attendanceCounts(items);

  // CR-181: applies a decision to the local list once the server accepted it.
  function applyAttendance(
    ids: ReadonlySet<string> | 'claimed',
    attendance: RegistrationAttendance | null,
  ) {
    setItems((current) =>
      current.map((item) => {
        const hit =
          ids === 'claimed'
            ? item.finishClaimedAt !== null && item.attendance === null
            : ids.has(item.id);
        return hit ? { ...item, attendance } : item;
      }),
    );
  }

  async function save(action: () => Promise<void>) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await action();
    } catch {
      // A stale list is the usual cause (`participant_not_found`): re-read it
      // quietly, without the loading skeleton, so the organizer sees the truth.
      showToast(FINISH_CHECKIN_TERMS.saveError, 'danger');
      getRideParticipants(rideId)
        .then((response) => setItems(response.items))
        .catch(() => undefined);
    } finally {
      setIsSaving(false);
    }
  }

  function handleConfirmAll() {
    void save(async () => {
      const { updated } = await confirmClaimedFinishes(rideId);
      applyAttendance('claimed', 'finished');
      showToast(FINISH_CHECKIN_TERMS.confirmAllSuccess(updated));
    });
  }

  function handleMark(id: string, attendance: RegistrationAttendance | null) {
    void save(async () => {
      await setAttendance(rideId, [id], attendance);
      applyAttendance(new Set([id]), attendance);
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-body-sm font-medium text-text">
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

      {status === 'ready' && items.length > 0 && attendanceOpen && (
        <div
          className="flex flex-col gap-3 rounded-xl bg-surface p-3"
          data-testid="attendance-panel"
        >
          <p className="text-body-sm text-text-secondary tabular-nums">
            {FINISH_CHECKIN_TERMS.summary(
              counts.confirmed,
              counts.claimed,
              counts.dnf,
              counts.noShow,
            )}
          </p>
          <Button
            className="self-start"
            isLoading={isSaving}
            disabled={isSaving || counts.claimed === 0}
            onClick={handleConfirmAll}
          >
            {FINISH_CHECKIN_TERMS.confirmAll(counts.claimed)}
          </Button>
          {counts.claimed === 0 ? (
            <p className="text-body-sm text-text-secondary">
              {FINISH_CHECKIN_TERMS.confirmAllEmpty}
            </p>
          ) : null}
        </div>
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
            <ParticipantRow
              key={item.id}
              rideId={rideId}
              item={item}
              attendanceOpen={attendanceOpen}
              disabled={isSaving}
              onMark={handleMark}
            />
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
                  <h2 id={headingId} className="text-h3 text-text">
                    {section.group
                      ? formatGroupRef(section.group)
                      : PARTICIPANTS_GROUP_TERMS.ungroupedHeading}
                  </h2>
                  <p className="text-body-sm tabular-nums text-text-secondary">
                    {PARTICIPANTS_GROUP_TERMS.participantsCount(
                      section.items.length,
                    )}
                  </p>
                </div>
                {section.items.length > 0 && (
                  <ul className="flex flex-col gap-3">
                    {section.items.map((item) => (
                      <ParticipantRow
                        key={item.id}
                        rideId={rideId}
                        item={item}
                        attendanceOpen={attendanceOpen}
                        disabled={isSaving}
                        onMark={handleMark}
                      />
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

function ParticipantRow({
  rideId,
  item,
  attendanceOpen,
  disabled,
  onMark,
}: {
  rideId: string;
  item: RideParticipantSummary;
  attendanceOpen: boolean;
  disabled: boolean;
  onMark: (id: string, attendance: RegistrationAttendance | null) => void;
}) {
  const joinedAt = new Date(item.createdAt);
  const name = item.displayName ?? PARTICIPANTS_TERMS.noNameFallback;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-none last:pb-0">
      <p className="min-w-0 break-words text-body-sm font-medium text-text">
        {/* CR-149: the name opens the rider's profile card. */}
        <Link
          href={riderProfileHref(rideId, item.id, 'participants')}
          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {item.displayName ?? PARTICIPANTS_TERMS.noNameFallback}
        </Link>
      </p>
      <p className="text-body-sm text-text-secondary">
        {PARTICIPANTS_TERMS.joinedAtLabel}: {formatDate(joinedAt)}{' '}
        {formatTime(joinedAt)}
      </p>
      {attendanceOpen ? (
        <div
          role="group"
          aria-label={FINISH_CHECKIN_TERMS.rowActionsLabel(name)}
          className="flex w-full flex-wrap items-center gap-2"
        >
          {item.attendance === 'finished' ? (
            <StatusBadge
              label={FINISH_CHECKIN_TERMS.badgeConfirmed}
              tone="success"
            />
          ) : item.attendance === 'dnf' ? (
            <StatusBadge label={FINISH_CHECKIN_TERMS.badgeDnf} tone="warning" />
          ) : item.attendance === 'no_show' ? (
            <StatusBadge
              label={FINISH_CHECKIN_TERMS.badgeNoShow}
              tone="danger"
            />
          ) : item.finishClaimedAt ? (
            <StatusBadge
              label={FINISH_CHECKIN_TERMS.badgeClaimed}
              tone="info"
            />
          ) : null}
          {item.attendance === null ? (
            <>
              <Button
                variant="secondary"
                className="min-h-11"
                disabled={disabled}
                onClick={() => onMark(item.id, 'finished')}
              >
                {FINISH_CHECKIN_TERMS.confirmOne}
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                disabled={disabled}
                onClick={() => onMark(item.id, 'dnf')}
              >
                {FINISH_CHECKIN_TERMS.markDnf}
              </Button>
              <Button
                variant="danger"
                className="min-h-11"
                disabled={disabled}
                onClick={() => onMark(item.id, 'no_show')}
              >
                {FINISH_CHECKIN_TERMS.markNoShow}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="min-h-11 border-0 px-3 text-text-secondary"
              disabled={disabled}
              onClick={() => onMark(item.id, null)}
            >
              {FINISH_CHECKIN_TERMS.undo}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
