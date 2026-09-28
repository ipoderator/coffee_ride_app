'use client';

import { CircleX, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useId, useState } from 'react';
import type {
  Registration,
  RideGroupSummary,
  RideStatus,
  WaitlistEntry,
} from 'types';
import {
  Button,
  cn,
  ConfirmDialog,
  formatCountdownShort,
  formatGroupPace,
  formatGroupPaceParts,
  formatPrice,
  METRIC_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_GROUP_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_RIDERS_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_POSTER_TERMS,
  RIDE_TICKET_TERMS,
  SegmentedControl,
  useToast,
} from 'ui';
import { loginHref } from '@/lib/auth/next-path';
import {
  ApiError,
  cancelRideRegistration,
  changeRegistrationGroup,
  joinRideWaitlist,
  leaveRideWaitlist,
  registerForRide,
} from '../api';
import { seatsLeftOf, type TicketState } from '../lib/ticket-state';

/**
 * API error `code` → the message this screen shows. Group codes (CR-117) get
 * their own copy — they tell the viewer what to do next; everything else keeps
 * the one generic action-failure fallback.
 */
function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.problem.code) {
      case 'group_required':
        return RIDE_DETAIL_GROUP_TERMS.groupRequired;
      case 'group_not_found':
        return RIDE_DETAIL_GROUP_TERMS.groupNotFound;
      case 'group_change_not_allowed':
        return RIDE_DETAIL_GROUP_TERMS.groupChangeNotAllowed;
    }
  }
  return RIDE_DETAIL_TERMS.registrationActionError;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.problem.code === 'unauthorized';
}

// Minute resolution is all the countdown shows.
const TICK_MS = 30_000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

const FRAME_TONE = {
  frame: 'border-frame',
  success: 'border-success',
  danger: 'border-danger',
} as const;

/**
 * The ticket's outline (shape after 21st larsen66/admit-one-ticket; its
 * shader/glare left out — no gradients or glow, `docs/design.md` §1): a raised
 * card whose perforation row bites a half-circle out of each side. The bites
 * are page-coloured half discs drawn over the border, so no measuring is
 * needed.
 */
function TicketFrame({
  tone,
  stub,
  children,
}: {
  tone: keyof typeof FRAME_TONE;
  stub: ReactNode;
  children: ReactNode;
}) {
  const border = FRAME_TONE[tone];
  return (
    <div
      data-testid="ride-ticket"
      className={cn(
        'relative flex flex-col gap-4 rounded-3xl border-[1.5px] bg-bg-raised px-5 pt-5.5 pb-5',
        border,
      )}
    >
      <div className="flex min-h-23 items-end justify-between gap-3">
        {stub}
      </div>
      <div aria-hidden="true" className="relative -mx-5 h-0">
        <span className="absolute inset-x-6.5 top-0 border-t-[1.5px] border-dashed border-border-input" />
        <span
          className={cn(
            'absolute -top-[11px] -left-[11.75px] size-[22px] rounded-full border-[1.5px] bg-bg [clip-path:inset(0_0_0_50%)]',
            border,
          )}
        />
        <span
          className={cn(
            'absolute -top-[11px] -right-[11.75px] size-[22px] rounded-full border-[1.5px] bg-bg [clip-path:inset(0_50%_0_0)]',
            border,
          )}
        />
      </div>
      {children}
    </div>
  );
}

function StubText({
  title,
  titleClassName,
  children,
}: {
  title: string;
  titleClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3
        className={cn(
          'font-mono text-label text-text-secondary uppercase',
          titleClassName,
        )}
      >
        {title}
      </h3>
      {children ? (
        <p className="text-body-sm text-text-secondary">{children}</p>
      ) : null}
    </div>
  );
}

function BigNumber({
  sign,
  value,
  className,
}: {
  sign: string;
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'shrink-0 font-num text-8xl leading-[0.78] font-extrabold tracking-[-0.01em] text-text tabular-nums',
        className,
      )}
    >
      <span className="mr-0.5 text-[0.36em] font-bold text-text-muted">
        {sign}
      </span>
      {value}
    </span>
  );
}

function Cell({
  label,
  children,
  className,
  testId,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col gap-0.5 rounded-xl bg-surface px-3 py-2.5',
        className,
      )}
    >
      <span className="font-mono text-label text-text-secondary uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Seats({
  state,
  participantLimit,
  registrationsCount,
}: {
  state: TicketState;
  participantLimit: number | null;
  registrationsCount: number;
}) {
  if (participantLimit === null) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-body-sm">
        <span className="text-text tabular-nums">
          {RIDE_DETAIL_RIDERS_TERMS.ridersCount(registrationsCount)}
        </span>
        <span className="text-text-secondary">{RIDE_TICKET_TERMS.noLimit}</span>
      </div>
    );
  }
  const left = seatsLeftOf(participantLimit, registrationsCount) ?? 0;
  const percent =
    participantLimit > 0
      ? Math.min(100, Math.round((registrationsCount / participantLimit) * 100))
      : 0;
  const few = state === 'few';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-body-sm">
        <span>
          <b className="font-semibold text-text tabular-nums">
            {RIDE_TICKET_TERMS.participantsOf(
              registrationsCount,
              participantLimit,
            )}
          </b>{' '}
          <span className="text-text-secondary">
            {RIDE_TICKET_TERMS.participantsWord}
          </span>
        </span>
        <span
          className={cn(
            few ? 'font-semibold text-warning' : 'text-text-secondary',
          )}
        >
          {left > 0
            ? RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(left)
            : REGISTRATION_ACTION_TERMS.full}
        </span>
      </div>
      {/* ADR-024: the fill bar reinforces the text above it — colour never
          carries the meaning alone (§12). */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={METRIC_TERMS.participants}
        className="h-1 overflow-hidden rounded-full bg-surface"
      >
        <div
          className={cn(
            'h-full rounded-full',
            few ? 'bg-warning-fill' : left === 0 ? 'bg-text-muted' : 'bg-brand',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function groupOptions(groups: RideGroupSummary[]) {
  return groups.map((group) => ({
    value: group.id,
    label: group.name,
    description: formatGroupPace(group.paceKmh),
  }));
}

export interface RegistrationTicketProps {
  rideId: string;
  rideStatus: RideStatus;
  state: TicketState;
  participantLimit: number | null;
  registrationsCount: number;
  waitlistCount: number;
  viewerRegistration: Registration | null;
  viewerWaitlistEntry: WaitlistEntry | null;
  viewerStartNumber: number | null;
  viewerWaitlistPosition: number | null;
  groups: RideGroupSummary[];
  /** «Сб, 3 окт» / «07:30» for the date/time cells. */
  dateLabel: string;
  timeLabel: string;
  startsAt: string;
  priceRub: number | null;
  startPointLabel: string | null;
  onShare: () => void;
  onChange: (registration: Registration | null) => void;
  onWaitlistChange: (waitlistEntry: WaitlistEntry | null) => void;
}

/**
 * CR-151 («Постер заезда v2»): the registration ticket — every registration
 * state on one card: a stub (what this is + a big «№ N» / «#N»), a
 * perforation, then the facts and the one action. Replaces CR-119's
 * `RegistrationButton`; its behaviour is unchanged — same API calls
 * (CR-032/033/036/117), `ConfirmDialog` before cancelling/leaving and a
 * `Toast` after every action (CR-103), and an anonymous viewer is sent to
 * sign in and back (CR-141). Whether the ride is full is re-checked by the
 * server on submit; the numbers here are the page's last read.
 *
 * A registered viewer can no longer cancel from here once the ride has
 * started or finished — there is nothing left to free a seat for.
 */
export function RegistrationTicket({
  rideId,
  rideStatus,
  state,
  participantLimit,
  registrationsCount,
  waitlistCount,
  viewerRegistration,
  viewerWaitlistEntry,
  viewerStartNumber,
  viewerWaitlistPosition,
  groups,
  dateLabel,
  timeLabel,
  startsAt,
  priceRub,
  startPointLabel,
  onShare,
  onChange,
  onWaitlistChange,
}: RegistrationTicketProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const hintId = useId();
  const now = useNow();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'cancel' | 'leaveWaitlist' | null
  >(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isChangingGroup, setIsChangingGroup] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);

  const hasGroups = groups.length > 0;
  const needsGroupChoice = hasGroups && !selectedGroupId;
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;

  async function run(
    action: () => Promise<void>,
    { closeDialog = false }: { closeDialog?: boolean } = {},
  ) {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      await action();
    } catch (err) {
      if (isUnauthorized(err)) {
        // CR-141 (KI-064): come back to this ride after signing in.
        router.push(loginHref(`/rides/${rideId}`));
        return;
      }
      if (closeDialog) setConfirmAction(null);
      setError(actionErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  function handleRegister() {
    if (needsGroupChoice) return;
    void run(async () => {
      // No group → the original body-less request (a ride without groups).
      const response =
        hasGroups && selectedGroupId
          ? await registerForRide(rideId, selectedGroupId)
          : await registerForRide(rideId);
      setSelectedGroupId(null);
      onChange(response.registration);
      showToast(RIDE_DETAIL_TERMS.registerSuccess);
    });
  }

  function handleJoinWaitlist() {
    if (needsGroupChoice) return;
    void run(async () => {
      const response =
        hasGroups && selectedGroupId
          ? await joinRideWaitlist(rideId, selectedGroupId)
          : await joinRideWaitlist(rideId);
      onWaitlistChange(response.waitlistEntry);
      showToast(RIDE_DETAIL_TERMS.joinWaitlistSuccess);
    });
  }

  function handleConfirmCancel() {
    void run(
      async () => {
        await cancelRideRegistration(rideId);
        onChange(null);
        setConfirmAction(null);
        setIsChangingGroup(false);
        showToast(RIDE_DETAIL_TERMS.cancelSuccess);
      },
      { closeDialog: true },
    );
  }

  function handleConfirmLeaveWaitlist() {
    void run(
      async () => {
        await leaveRideWaitlist(rideId);
        onWaitlistChange(null);
        setConfirmAction(null);
        showToast(RIDE_DETAIL_TERMS.leaveWaitlistSuccess);
      },
      { closeDialog: true },
    );
  }

  function handleSaveGroup() {
    if (!pendingGroupId) return;
    const groupId = pendingGroupId;
    void run(async () => {
      const response = await changeRegistrationGroup(rideId, groupId);
      onChange(response.registration);
      setIsChangingGroup(false);
      showToast(RIDE_DETAIL_GROUP_TERMS.changeSuccess);
    });
  }

  const errorAlert = error ? (
    <p role="alert" className="text-body-sm text-danger">
      {error}
    </p>
  ) : null;

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmCancel}
        title={RIDE_DETAIL_TERMS.cancelConfirmTitle}
        description={RIDE_DETAIL_TERMS.cancelConfirmDescription}
        confirmLabel={REGISTRATION_ACTION_TERMS.cancel}
        cancelLabel={RIDE_DETAIL_TERMS.keepLabel}
        isConfirming={isPending}
      />
      <ConfirmDialog
        open={confirmAction === 'leaveWaitlist'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmLeaveWaitlist}
        title={RIDE_DETAIL_TERMS.leaveWaitlistConfirmTitle}
        description={RIDE_DETAIL_TERMS.leaveWaitlistConfirmDescription}
        confirmLabel={REGISTRATION_ACTION_TERMS.leaveWaitlist}
        cancelLabel={RIDE_DETAIL_TERMS.keepLabel}
        isConfirming={isPending}
      />
    </>
  );

  const dateCells = (
    <div className="grid grid-cols-2 gap-2">
      <Cell label={RIDE_TICKET_TERMS.dateLabel}>
        <b className="font-semibold text-text tabular-nums">{dateLabel}</b>
      </Cell>
      <Cell label={RIDE_TICKET_TERMS.startTimeLabel}>
        <b className="font-semibold text-text tabular-nums">{timeLabel}</b>
      </Cell>
    </div>
  );

  const seats = (
    <Seats
      state={state}
      participantLimit={participantLimit}
      registrationsCount={registrationsCount}
    />
  );

  const shareButton = (
    <Button
      variant="secondary"
      className="min-h-11 border-0 px-3 text-body-sm text-text-secondary hover:text-text"
      onClick={onShare}
    >
      <Share2 className="size-4" aria-hidden="true" />
      {RIDE_POSTER_TERMS.share}
    </Button>
  );

  // ---- open / few / full: pick a group, register or join the queue --------
  if (state === 'open' || state === 'few' || state === 'full') {
    const full = state === 'full';
    const place = registrationsCount + 1;
    return (
      <TicketFrame
        tone="frame"
        stub={
          full ? (
            <>
              <StubText title={RIDE_TICKET_TERMS.waitlistLabel}>
                {RIDE_TICKET_TERMS.queueSize(waitlistCount)}
                <br />
                {RIDE_TICKET_TERMS.queueHint}
              </StubText>
              <BigNumber
                sign={RIDE_TICKET_TERMS.queueSign}
                value={waitlistCount + 1}
                className="text-7xl text-info"
              />
            </>
          ) : (
            <>
              <StubText title={RIDE_TICKET_TERMS.startListLabel}>
                {RIDE_TICKET_TERMS.youWillBe(place, participantLimit)}
              </StubText>
              <BigNumber sign={RIDE_TICKET_TERMS.numberSign} value={place} />
            </>
          )
        }
      >
        {dateCells}
        {hasGroups ? (
          <div className="flex flex-col gap-2">
            <SegmentedControl
              id="ride-groups"
              name="ride-group"
              legend={RIDE_TICKET_TERMS.groupLegend}
              showLegend
              variant="tall"
              options={groupOptions(groups)}
              value={selectedGroupId}
              onChange={setSelectedGroupId}
              disabled={isPending}
            />
            {selectedGroup ? (
              <p className="text-body-sm text-text-secondary tabular-nums">
                {RIDE_TICKET_TERMS.groupNote(
                  selectedGroup.name,
                  selectedGroup.registrationsCount,
                )}
              </p>
            ) : null}
          </div>
        ) : null}
        {seats}
        <Button
          className="w-full"
          isLoading={isPending}
          disabled={needsGroupChoice}
          aria-describedby={needsGroupChoice ? hintId : undefined}
          onClick={full ? handleJoinWaitlist : handleRegister}
        >
          {full
            ? REGISTRATION_ACTION_TERMS.joinWaitlist
            : REGISTRATION_ACTION_TERMS.register}
        </Button>
        {needsGroupChoice ? (
          <p
            id={hintId}
            className="text-center text-body-sm text-text-secondary"
          >
            {RIDE_DETAIL_GROUP_TERMS.pickHint}
          </p>
        ) : null}
        {errorAlert}
        <p className="text-center text-body-sm text-text-secondary">
          {full
            ? RIDE_TICKET_TERMS.waitlistNote
            : RIDE_TICKET_TERMS.registerNote(formatPrice(priceRub))}
        </p>
      </TicketFrame>
    );
  }

  // ---- registered -----------------------------------------------------------
  if (state === 'registered' && viewerRegistration) {
    const viewerGroup =
      groups.find((group) => group.id === viewerRegistration.groupId) ?? null;
    const rideOver = rideStatus === 'started' || rideStatus === 'finished';
    const mustPickGroup = hasGroups && viewerGroup === null;
    const canChangeGroup = hasGroups && rideStatus !== 'finished';
    const showPicker = canChangeGroup && (mustPickGroup || isChangingGroup);
    const countdown = rideOver
      ? null
      : formatCountdownShort(new Date(startsAt), now);
    const pace = viewerGroup ? formatGroupPaceParts(viewerGroup.paceKmh) : null;

    return (
      <TicketFrame
        tone="success"
        stub={
          <>
            <StubText
              title={RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle}
              titleClassName="text-success"
            >
              {countdown ? RIDE_TICKET_TERMS.countdown(countdown) : null}
            </StubText>
            {viewerStartNumber !== null ? (
              <BigNumber
                sign={RIDE_TICKET_TERMS.numberSign}
                value={viewerStartNumber}
              />
            ) : null}
          </>
        }
      >
        {dateCells}
        {viewerGroup && pace && !isChangingGroup ? (
          <Cell
            label={RIDE_TICKET_TERMS.yourGroupLabel}
            testId="ticket-group"
            className="flex-row items-center justify-between gap-3"
          >
            <b className="min-w-0 font-semibold text-text">
              <span className="sr-only">
                {RIDE_TICKET_TERMS.yourGroupLabel}:{' '}
              </span>
              {viewerGroup.name}
            </b>
            <span className="shrink-0 font-num text-3xl leading-none font-extrabold text-text tabular-nums">
              {pace.value}
              <span className="ml-1 font-mono text-[0.4em] font-normal text-text-secondary">
                {pace.unit}
              </span>
            </span>
          </Cell>
        ) : null}
        {showPicker ? (
          <div className="flex flex-col gap-3">
            {mustPickGroup ? (
              <p className="text-body-sm text-text-secondary">
                {RIDE_DETAIL_GROUP_TERMS.noGroupDescription}
              </p>
            ) : null}
            <SegmentedControl
              name={`${hintId}-change-group`}
              legend={
                mustPickGroup
                  ? RIDE_DETAIL_GROUP_TERMS.noGroupTitle
                  : RIDE_DETAIL_GROUP_TERMS.changeGroup
              }
              showLegend
              variant="tall"
              options={groupOptions(groups)}
              value={pendingGroupId}
              onChange={setPendingGroupId}
              disabled={isPending}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                isLoading={isPending}
                disabled={!pendingGroupId || pendingGroupId === viewerGroup?.id}
                onClick={handleSaveGroup}
              >
                {RIDE_DETAIL_GROUP_TERMS.saveGroup}
              </Button>
              {!mustPickGroup ? (
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    setIsChangingGroup(false);
                  }}
                >
                  {RIDE_DETAIL_GROUP_TERMS.cancelChange}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {startPointLabel ? (
          <Cell label={RIDE_TICKET_TERMS.meetingPointLabel}>
            <span className="font-medium text-text">{startPointLabel}</span>
          </Cell>
        ) : null}
        {errorAlert}
        <div className="flex flex-wrap justify-center gap-1">
          {canChangeGroup && viewerGroup && !isChangingGroup ? (
            <Button
              variant="secondary"
              className="min-h-11 border-0 px-3 text-body-sm text-text-secondary hover:text-text"
              onClick={() => {
                setError(null);
                setPendingGroupId(viewerGroup.id);
                setIsChangingGroup(true);
              }}
            >
              {RIDE_DETAIL_GROUP_TERMS.changeGroup}
            </Button>
          ) : null}
          {shareButton}
        </div>
        {!rideOver ? (
          <Button
            variant="danger"
            className="w-full"
            isLoading={isPending && confirmAction === 'cancel'}
            disabled={isPending}
            onClick={() => setConfirmAction('cancel')}
          >
            {REGISTRATION_ACTION_TERMS.cancel}
          </Button>
        ) : null}
        {dialogs}
      </TicketFrame>
    );
  }

  // ---- waitlisted -----------------------------------------------------------
  if (state === 'waitlisted' && viewerWaitlistEntry) {
    const waitlistGroup =
      groups.find((group) => group.id === viewerWaitlistEntry.groupId) ?? null;
    return (
      <TicketFrame
        tone="frame"
        stub={
          <>
            <StubText
              title={RIDE_TICKET_TERMS.waitlistedTitle}
              titleClassName="text-info"
            >
              {RIDE_TICKET_TERMS.waitlistedHint}
            </StubText>
            {viewerWaitlistPosition !== null ? (
              <BigNumber
                sign={RIDE_TICKET_TERMS.queueSign}
                value={viewerWaitlistPosition}
                className="text-7xl text-info"
              />
            ) : null}
          </>
        }
      >
        {dateCells}
        {waitlistGroup ? (
          <Cell label={RIDE_TICKET_TERMS.yourGroupLabel}>
            <b className="font-semibold text-text">
              {waitlistGroup.name} · {formatGroupPace(waitlistGroup.paceKmh)}
            </b>
          </Cell>
        ) : null}
        {seats}
        {errorAlert}
        <Button
          variant="secondary"
          className="w-full"
          isLoading={isPending}
          onClick={() => setConfirmAction('leaveWaitlist')}
        >
          {REGISTRATION_ACTION_TERMS.leaveWaitlist}
        </Button>
        {dialogs}
      </TicketFrame>
    );
  }

  // ---- cancelled ------------------------------------------------------------
  if (state === 'cancelled') {
    return (
      <TicketFrame
        tone="danger"
        stub={
          <>
            <StubText
              title={RIDE_TICKET_TERMS.cancelledTitle}
              titleClassName="text-danger"
            >
              {RIDE_TICKET_TERMS.cancelledHint}
            </StubText>
            <CircleX
              aria-hidden="true"
              className="size-14 shrink-0 text-danger"
              strokeWidth={1.6}
            />
          </>
        }
      >
        <p className="flex items-start gap-2 rounded-xl bg-danger px-3 py-2.5 text-body-sm font-medium text-on-danger">
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {RIDE_TICKET_TERMS.cancelledBanner}
        </p>
        {dateCells}
      </TicketFrame>
    );
  }

  // ---- no action: not open yet / closed / started / finished ---------------
  const quiet = {
    notOpen: [RIDE_TICKET_TERMS.notOpenTitle, RIDE_TICKET_TERMS.notOpenHint],
    closed: [RIDE_TICKET_TERMS.closedTitle, RIDE_TICKET_TERMS.closedHint],
    started: [RIDE_TICKET_TERMS.startedTitle, RIDE_TICKET_TERMS.rideOverHint],
    finished: [RIDE_TICKET_TERMS.finishedTitle, RIDE_TICKET_TERMS.rideOverHint],
  } as const;
  const [title, hint] = quiet[state as keyof typeof quiet] ?? quiet.notOpen;
  return (
    <TicketFrame
      tone="frame"
      stub={
        <>
          <StubText title={title}>{hint}</StubText>
          {state === 'closed' && participantLimit !== null ? (
            <span className="shrink-0 font-num text-7xl leading-[0.78] font-extrabold text-text-muted tabular-nums">
              {registrationsCount}
              <span className="ml-1 text-[0.36em] font-bold">
                /{participantLimit}
              </span>
            </span>
          ) : null}
        </>
      }
    >
      {dateCells}
      {state === 'notOpen' || state === 'closed' ? seats : null}
      <div className="flex justify-center">{shareButton}</div>
    </TicketFrame>
  );
}
