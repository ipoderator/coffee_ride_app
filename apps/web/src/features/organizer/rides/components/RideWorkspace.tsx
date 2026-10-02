'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Ride, RideStatus, RideUpdate } from 'types';
import {
  BACK_LINK_TERMS,
  Button,
  buttonClassName,
  Card,
  ConfirmDialog,
  ErrorState,
  FINISH_CHECKIN_TERMS,
  formatRideStartLine,
  RIDE_EDIT_TERMS,
  RIDE_LIST_TERMS,
  RIDE_STATUS_TERMS,
  RIDE_WORKSPACE_TERMS,
  Skeleton,
  StatusBadge,
} from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { ORGANIZER_RIDE_READINESS } from '@/lib/cabinet/organizer-ride-readiness';
import {
  RideWorkspaceContext,
  type RideWorkspaceContextValue,
  type RideWorkspaceData,
} from '@/lib/cabinet/ride-workspace';
import type { RideSectionLink } from '@/lib/cabinet/types';
import { isRideOverdue } from '@/lib/rides/overdue';
import {
  ApiError,
  closeRegistration,
  finishRide,
  getLatestRideUpdate,
  getRide,
  openRegistration,
  startRide,
} from '../api';
import { RideWorkspaceTabs } from './RideWorkspaceTabs';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';
type Busy = 'open' | 'close' | 'start' | 'finish' | null;
type Message = { tone: 'success' | 'danger'; text: string } | null;

async function readWorkspace(
  rideId: string,
): Promise<RideWorkspaceData | 'not-found'> {
  const [response, latestUpdate] = await Promise.all([
    getRide(rideId),
    // Only the overview/updates lines need it; a failure there must not
    // take the whole ride down.
    getLatestRideUpdate(rideId).catch((): RideUpdate | undefined => undefined),
  ]);
  // KI-069: `GET /v1/rides/:id` is also the public ride page — a non-owner
  // gets a 200 for a published ride. Same «not found or not yours» answer.
  if (!response.isOwner) return 'not-found';
  return {
    ride: response.ride,
    route: response.route ?? null,
    stops: response.stops ?? [],
    routePoints: response.routePoints ?? [],
    groups: response.groups ?? [],
    registrationsCount: response.registrationsCount ?? 0,
    waitlistCount: response.waitlistCount ?? 0,
    attendanceSummary: response.attendanceSummary ?? null,
    requirements: response.requirements,
    contact: response.contact,
    latestUpdate,
  };
}

/**
 * CR-187 (UX review «Управление», `docs/design.md` §8): the frame every
 * `/organizer/rides/[id]/*` page shares. Owns the ride read and the
 * lifecycle steps, so the status, the full title and the next action are on
 * screen before any section loads, on every tab. A section is the page's
 * `children`, keyed by the ride's status: a transition remounts it with fresh
 * data instead of leaving it on rules of the previous status.
 *
 * Every action is authorized server-side (`assertOwnRide`); `isOwner` only
 * decides what this screen offers. `variant="wizard"` drops the back link and
 * the tabs — the new-ride wizard (CR-156) has its own step list.
 */
export function RideWorkspace({
  rideId,
  current,
  sections,
  variant = 'full',
  children,
}: {
  rideId: string;
  /** `'edit'` (the overview) or a section's `segment`. */
  current: string;
  sections: readonly RideSectionLink[];
  variant?: 'full' | 'wizard';
  children: ReactNode;
}) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<RideWorkspaceData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [isCheckingFinish, setIsCheckingFinish] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    readWorkspace(rideId)
      .then((result) => {
        if (cancelled) return;
        if (result === 'not-found') {
          setStatus('not-found');
          return;
        }
        setData(result);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(
          error instanceof ApiError && error.problem.code === 'ride_not_found'
            ? 'not-found'
            : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, attempt]);

  /** Quiet re-read; a failure keeps what is on screen. */
  const refresh = useCallback(async () => {
    try {
      const result = await readWorkspace(rideId);
      if (result !== 'not-found') setData(result);
    } catch {
      // The last known state stays; the section that asked shows its own result.
    }
  }, [rideId]);

  const applyRide = useCallback((ride: Ride, text?: string) => {
    setData((previous) => (previous ? { ...previous, ride } : previous));
    if (text) setMessage({ tone: 'success', text });
  }, []);

  const contextValue = useMemo<RideWorkspaceContextValue | null>(
    () => (data ? { data, sections, refresh, applyRide } : null),
    [data, sections, refresh, applyRide],
  );

  async function transition(
    kind: Exclude<Busy, null>,
    call: (id: string) => Promise<{ ride: Ride }>,
    success: string,
  ): Promise<boolean> {
    if (busy) return false;
    setMessage(null);
    setBusy(kind);
    try {
      const response = await call(rideId);
      applyRide(response.ride, success);
      return true;
    } catch {
      setMessage({ tone: 'danger', text: RIDE_EDIT_TERMS.loadError });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleStart() {
    // `attendanceSummary` is null until the start: re-read it after.
    if (await transition('start', startRide, RIDE_EDIT_TERMS.startSuccess)) {
      await refresh();
    }
  }

  /** CR-182's undecided count, fresh: riders claim and the organizer marks
   * them while this page stays open. */
  async function readUnresolved(): Promise<number | null> {
    try {
      const result = await readWorkspace(rideId);
      if (result === 'not-found') return null;
      setData(result);
      return result.attendanceSummary?.unresolved ?? null;
    } catch {
      return data?.attendanceSummary?.unresolved ?? null;
    }
  }

  /** CR-185: ask first when riders are still undecided. */
  async function requestFinish() {
    if (busy || isCheckingFinish) return;
    setIsCheckingFinish(true);
    const count = await readUnresolved();
    setIsCheckingFinish(false);
    if (count) setFinishConfirmOpen(true);
    else await handleFinish(count);
  }

  async function handleFinish(unresolvedCount: number | null) {
    await transition(
      'finish',
      finishRide,
      // CR-182: never «everyone finished» when some are undecided.
      unresolvedCount
        ? FINISH_CHECKIN_TERMS.finishedWithUnresolved(unresolvedCount)
        : RIDE_EDIT_TERMS.finishSuccess,
    );
    setFinishConfirmOpen(false);
  }

  const isFull = variant === 'full';

  if (status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-11 w-80 max-w-full" />
        </div>
        {isFull && <Skeleton className="h-11 w-full" />}
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (status === 'not-found' || status === 'error' || !data || !contextValue) {
    return (
      <div className="flex flex-col gap-6">
        {isFull && (
          <BackLink
            href="/organizer/rides"
            label={BACK_LINK_TERMS.toOrganizerRides}
          />
        )}
        <h1>{RIDE_WORKSPACE_TERMS.eyebrow}</h1>
        {status === 'not-found' ? (
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-body-sm font-medium text-text">
              {RIDE_EDIT_TERMS.notFoundTitle}
            </p>
            <p className="max-w-sm text-body-sm text-text-secondary">
              {RIDE_EDIT_TERMS.notFoundDescription}
            </p>
            <Link
              href="/organizer/rides"
              className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
            >
              {RIDE_EDIT_TERMS.backToList}
            </Link>
          </Card>
        ) : (
          <ErrorState
            message={RIDE_WORKSPACE_TERMS.loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        )}
      </div>
    );
  }

  const { ride } = data;
  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const unresolved = data.attendanceSummary?.unresolved ?? 0;
  const section = sections.find((item) => item.segment === current);
  const readiness = section
    ? (ORGANIZER_RIDE_READINESS[section.segment]?.(data) ?? null)
    : null;

  const actions =
    ride.status === 'draft' ? null : (
      <HeadActions
        rideId={rideId}
        status={ride.status}
        registrationsCount={data.registrationsCount}
        busy={busy}
        onOpen={() =>
          void transition(
            'open',
            openRegistration,
            RIDE_EDIT_TERMS.openRegistrationSuccess,
          )
        }
        onClose={() =>
          void transition(
            'close',
            closeRegistration,
            RIDE_EDIT_TERMS.closeRegistrationSuccess,
          )
        }
        onStart={() => void handleStart()}
        onFinish={() => void requestFinish()}
      />
    );

  return (
    <RideWorkspaceContext.Provider value={contextValue}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          {isFull && (
            <BackLink
              href="/organizer/rides"
              label={BACK_LINK_TERMS.toOrganizerRides}
            />
          )}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
              {isRideOverdue(ride, new Date()) && (
                <StatusBadge
                  label={RIDE_LIST_TERMS.overdueBadge}
                  tone="warning"
                />
              )}
              <span className="font-mono text-label text-text-secondary uppercase tabular-nums">
                {formatRideStartLine(new Date(ride.startsAt), {
                  timeZone: ride.startTimezone,
                })}
              </span>
            </div>
            <h1 className="wrap-anywhere">{ride.title}</h1>
            <p className="text-body-sm text-text-secondary">
              {ride.status === 'draft'
                ? RIDE_WORKSPACE_TERMS.draftEyebrow
                : RIDE_WORKSPACE_TERMS.eyebrow}
            </p>
          </div>

          {actions}

          {ride.status === 'started' && unresolved > 0 && (
            <p
              className="text-body-sm text-warning"
              data-testid="unresolved-before-finish"
            >
              {FINISH_CHECKIN_TERMS.unresolvedBeforeFinish(unresolved)}
            </p>
          )}

          {message?.tone === 'success' && (
            <p role="status" className="text-body-sm text-success">
              {message.text}
            </p>
          )}
          {message?.tone === 'danger' && (
            <p role="alert" className="text-body-sm text-danger">
              {message.text}
            </p>
          )}
        </header>

        {isFull && (
          <RideWorkspaceTabs
            rideId={rideId}
            current={current}
            sections={sections}
          />
        )}

        {section && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-h2 text-text">
                {section.title ?? section.label}
              </h2>
              {section.description && (
                <p className="max-w-2xl text-body-sm text-text-secondary">
                  {section.description}
                </p>
              )}
            </div>
            {readiness && (
              <StatusBadge
                label={readiness.chip}
                tone={readiness.tone}
                className="shrink-0 self-start"
              />
            )}
          </div>
        )}

        <div key={ride.status} className="flex min-w-0 flex-col gap-6">
          {children}
        </div>
      </div>

      {ride.status === 'started' && (
        <ConfirmDialog
          open={finishConfirmOpen}
          onClose={() => setFinishConfirmOpen(false)}
          onConfirm={() => void handleFinish(unresolved)}
          title={FINISH_CHECKIN_TERMS.finishConfirmTitle}
          description={FINISH_CHECKIN_TERMS.finishConfirmUnresolved(unresolved)}
          confirmLabel={FINISH_CHECKIN_TERMS.finishConfirmAction}
          cancelLabel={FINISH_CHECKIN_TERMS.finishConfirmCancel}
          isConfirming={busy === 'finish'}
          confirmVariant="primary"
        />
      )}
    </RideWorkspaceContext.Provider>
  );
}

/**
 * The head's actions, most important first. Closing registration is neutral
 * on purpose — it is not a cancellation (that stays on the overview, red).
 * A finished or cancelled ride offers no lifecycle step: the server would
 * refuse every one.
 */
function HeadActions({
  rideId,
  status,
  registrationsCount,
  busy,
  onOpen,
  onClose,
  onStart,
  onFinish,
}: {
  rideId: string;
  status: Exclude<RideStatus, 'draft'>;
  registrationsCount: number;
  busy: Busy;
  onOpen: () => void;
  onClose: () => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const base = `/organizer/rides/${rideId}`;
  // On a phone the buttons share rows instead of three ragged widths.
  const grow = 'grow sm:grow-0';
  const participantsPrimary =
    status === 'registration_open' || status === 'started';

  const participants = (
    <Link
      key="participants"
      href={`${base}/participants`}
      className={buttonClassName(
        participantsPrimary ? 'primary' : 'secondary',
        grow,
      )}
    >
      {RIDE_WORKSPACE_TERMS.participantsAction(registrationsCount)}
    </Link>
  );
  const write = (
    <Link
      key="write"
      href={`${base}/updates`}
      className={buttonClassName('secondary', grow)}
    >
      {RIDE_WORKSPACE_TERMS.writeAction}
    </Link>
  );

  let items: ReactNode[];
  switch (status) {
    case 'published':
      items = [
        <Button
          key="open"
          className={grow}
          isLoading={busy === 'open'}
          onClick={onOpen}
        >
          {busy === 'open'
            ? RIDE_EDIT_TERMS.openRegistrationPending
            : RIDE_EDIT_TERMS.openRegistration}
        </Button>,
        participants,
        write,
      ];
      break;
    case 'registration_open':
      items = [
        participants,
        write,
        <Button
          key="close"
          variant="secondary"
          className={grow}
          isLoading={busy === 'close'}
          onClick={onClose}
        >
          {busy === 'close'
            ? RIDE_EDIT_TERMS.closeRegistrationPending
            : RIDE_EDIT_TERMS.closeRegistration}
        </Button>,
      ];
      break;
    case 'registration_closed':
      items = [
        <Button
          key="start"
          className={grow}
          isLoading={busy === 'start'}
          onClick={onStart}
        >
          {busy === 'start'
            ? RIDE_EDIT_TERMS.startPending
            : RIDE_EDIT_TERMS.start}
        </Button>,
        participants,
        write,
      ];
      break;
    case 'started':
      items = [
        participants,
        write,
        <Button
          key="finish"
          variant="secondary"
          className={grow}
          // Not loading while the count is re-read: a disabled button drops
          // focus, and the dialog returns focus to its opener.
          isLoading={busy === 'finish'}
          onClick={onFinish}
        >
          {busy === 'finish'
            ? RIDE_EDIT_TERMS.finishPending
            : RIDE_EDIT_TERMS.finish}
        </Button>,
      ];
      break;
    case 'finished':
    case 'cancelled':
      items = [participants, write];
      break;
  }

  return (
    <div
      role="group"
      aria-label={RIDE_WORKSPACE_TERMS.actionsLabel}
      className="flex flex-wrap gap-3"
    >
      {items}
    </div>
  );
}
