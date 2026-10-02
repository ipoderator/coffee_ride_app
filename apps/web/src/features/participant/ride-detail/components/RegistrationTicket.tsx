'use client';

import { CircleX } from 'lucide-react';
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
  FINISH_CHECKIN_TERMS,
  formatCountdownShort,
  formatGroupPace,
  formatGroupPaceParts,
  formatPrice,
  METRIC_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_GROUP_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_PAGE_TERMS,
  RIDE_TICKET_TERMS,
  StatusBadge,
  useToast,
  type StatusTone,
} from 'ui';
import { loginHref } from '@/lib/auth/next-path';
import {
  ApiError,
  cancelRideRegistration,
  changeRegistrationGroup,
  claimRideFinish,
  joinRideWaitlist,
  leaveRideWaitlist,
  registerForRide,
  withdrawRideFinishClaim,
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
      case 'attendance_already_decided':
        return FINISH_CHECKIN_TERMS.alreadyDecided;
      case 'ride_not_in_progress':
        return FINISH_CHECKIN_TERMS.rideNotInProgress;
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
 * CR-155 (owner's mockup): a plain raised card — a head row with what this
 * block is («Стартовый лист», «Вы записаны», …) and the ride's status badge,
 * then the state's content, then the page's actions (GPX, calendar, share)
 * passed in as `footer`. Replaces CR-151's perforated ticket stub.
 */
function TicketCard({
  stateKey,
  tone,
  title,
  titleClassName,
  status,
  footer,
  children,
}: {
  /** CR-170: the registration state; a change after mount animates. */
  stateKey: TicketState;
  tone: keyof typeof FRAME_TONE;
  title: string;
  titleClassName?: string;
  status: { label: string; tone: StatusTone };
  footer: ReactNode;
  children: ReactNode;
}) {
  // CR-170: a state change (registered, queued, cancelled…) is shown, not
  // swapped — the frame colour eases over and the new content rises in. Only
  // a change after mount counts: the page's first render stays still.
  // Render-time "previous value" pattern, so no extra commit/effect.
  const [seenState, setSeenState] = useState(stateKey);
  const [changes, setChanges] = useState(0);
  if (stateKey !== seenState) {
    setSeenState(stateKey);
    setChanges((count) => count + 1);
  }
  const changed = changes > 0;

  return (
    <div
      data-testid="ride-ticket"
      className={cn(
        'flex flex-col gap-4 rounded-3xl border-[1.5px] bg-bg-raised p-5',
        'transition-colors duration-300 ease-quiet motion-reduce:transition-none',
        FRAME_TONE[tone],
      )}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3
          key={changes}
          className={cn(
            'font-mono text-label text-text-secondary uppercase',
            changed && 'motion-safe:animate-fade-in',
            titleClassName,
          )}
        >
          {title}
        </h3>
        <StatusBadge
          label={status.label}
          tone={status.tone}
          className="rounded-full px-2.5 py-1 text-xs leading-4 font-semibold"
        />
      </div>
      <div
        key={changes}
        data-ticket-body
        className={cn(
          'flex flex-col gap-4',
          changed && 'motion-safe:animate-rise-in',
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-body-sm text-text-secondary">{children}</p>;
}

/** A big figure with a small caption on its baseline — «13 из 20 участников»,
 * «№ 7», «# 3». */
function Figure({
  sign,
  value,
  caption,
  className,
}: {
  sign?: string;
  value: number;
  caption?: string;
  className?: string;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span
        className={cn(
          'font-num text-metric leading-none font-extrabold text-text tabular-nums',
          className,
        )}
      >
        {sign ? (
          <span className="mr-0.5 text-[0.5em] font-bold text-text-muted">
            {sign}
          </span>
        ) : null}
        {value}
      </span>
      {caption ? (
        <span className="font-mono text-body-sm text-text-secondary">
          {caption}
        </span>
      ) : null}
    </p>
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
  waitlistCount,
}: {
  state: TicketState;
  participantLimit: number | null;
  registrationsCount: number;
  waitlistCount: number;
}) {
  if (participantLimit === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <Figure
          value={registrationsCount}
          caption={RIDE_PAGE_TERMS.ridersWord(registrationsCount)}
        />
        <Hint>{RIDE_TICKET_TERMS.noLimit}</Hint>
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
    <div className="flex flex-col gap-2.5">
      <Figure
        value={registrationsCount}
        caption={RIDE_PAGE_TERMS.ofLimit(participantLimit)}
      />
      {/* ADR-024: the fill bar reinforces the text around it — colour never
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
            // CR-170: a count change slides the bar, not jumps it.
            'transition-[width] duration-500 ease-quiet motion-reduce:transition-none',
            few ? 'bg-warning-fill' : left === 0 ? 'bg-text-muted' : 'bg-brand',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        className={cn(
          'text-body-sm',
          few ? 'font-semibold text-warning' : 'text-text-secondary',
        )}
      >
        {left > 0
          ? RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(left)
          : RIDE_PAGE_TERMS.seatsFull(waitlistCount)}
      </p>
    </div>
  );
}

/** CR-155: pace groups as stacked radio cards — name · pace, and how many
 * have already chosen it (groups have no seat limit of their own). */
function GroupPicker({
  name,
  legend,
  groups,
  value,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  groups: RideGroupSummary[];
  value: string | null;
  onChange: (groupId: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 font-mono text-label text-text-secondary uppercase">
        {legend}
      </legend>
      {groups.map((group) => {
        const checked = value === group.id;
        return (
          <label
            key={group.id}
            className={cn(
              'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors',
              checked
                ? 'border-primary bg-surface'
                : 'border-border hover:border-border-input',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {/* The native radio itself, restyled: a ring, filled with a
                knocked-out dot once checked — clickable and focusable as is. */}
            <input
              type="radio"
              name={name}
              value={group.id}
              checked={checked}
              onChange={() => onChange(group.id)}
              className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-input checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_3px_var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-text tabular-nums">
                {RIDE_PAGE_TERMS.groupOption(
                  group.name,
                  formatGroupPace(group.paceKmh),
                )}
              </span>
              <span className="text-body-sm text-text-secondary tabular-nums">
                {RIDE_PAGE_TERMS.groupRiders(group.registrationsCount)}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * CR-181: the registered viewer's finish check-in once the ride is under way or
 * over. A claim is only a claim — «Ждём подтверждения» until the organizer
 * decides, and it can be withdrawn until then.
 */
function FinishCheckIn({
  registration,
  isPending,
  onClaim,
  onWithdraw,
}: {
  registration: Registration;
  isPending: boolean;
  onClaim: () => void;
  onWithdraw: () => void;
}) {
  const { attendance, finishClaimedAt } = registration;
  if (attendance === 'finished') {
    return (
      <Cell label={FINISH_CHECKIN_TERMS.sectionTitle} testId="finish-checkin">
        <b className="font-semibold text-success">
          {FINISH_CHECKIN_TERMS.confirmedTitle}
        </b>
        <Hint>{FINISH_CHECKIN_TERMS.confirmedHint}</Hint>
      </Cell>
    );
  }
  if (attendance === 'dnf') {
    return (
      <Cell label={FINISH_CHECKIN_TERMS.sectionTitle} testId="finish-checkin">
        <b className="font-semibold text-text">
          {FINISH_CHECKIN_TERMS.dnfTitle}
        </b>
        <Hint>{FINISH_CHECKIN_TERMS.dnfHint}</Hint>
      </Cell>
    );
  }
  if (attendance === 'no_show') {
    return (
      <Cell label={FINISH_CHECKIN_TERMS.sectionTitle} testId="finish-checkin">
        <b className="font-semibold text-text">
          {FINISH_CHECKIN_TERMS.noShowTitle}
        </b>
        <Hint>{FINISH_CHECKIN_TERMS.noShowHint}</Hint>
      </Cell>
    );
  }
  if (finishClaimedAt) {
    return (
      <Cell label={FINISH_CHECKIN_TERMS.sectionTitle} testId="finish-checkin">
        <b className="font-semibold text-text">
          {FINISH_CHECKIN_TERMS.claimedTitle}
        </b>
        <Hint>{FINISH_CHECKIN_TERMS.claimedHint}</Hint>
        <Button
          variant="secondary"
          className="mt-2 min-h-11 self-start"
          isLoading={isPending}
          disabled={isPending}
          onClick={onWithdraw}
        >
          {FINISH_CHECKIN_TERMS.withdrawButton}
        </Button>
      </Cell>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="finish-checkin">
      <Button
        className="w-full"
        isLoading={isPending}
        disabled={isPending}
        onClick={onClaim}
      >
        {FINISH_CHECKIN_TERMS.claimButton}
      </Button>
      <Hint>{FINISH_CHECKIN_TERMS.claimHint}</Hint>
    </div>
  );
}

export interface RegistrationTicketProps {
  rideId: string;
  rideStatus: RideStatus;
  state: TicketState;
  /** The ride's status badge in the card's head. */
  statusTerm: { label: string; tone: StatusTone };
  participantLimit: number | null;
  registrationsCount: number;
  waitlistCount: number;
  viewerRegistration: Registration | null;
  viewerWaitlistEntry: WaitlistEntry | null;
  viewerStartNumber: number | null;
  viewerWaitlistPosition: number | null;
  groups: RideGroupSummary[];
  /** «Сб, 3 окт» / «07:30» for a registered viewer's date/time cells. */
  dateLabel: string;
  timeLabel: string;
  startsAt: string;
  priceRub: number | null;
  startPointLabel: string | null;
  /** The page's actions under the card's content (GPX, calendar, share). */
  footer: ReactNode;
  onChange: (registration: Registration | null) => void;
  onWaitlistChange: (waitlistEntry: WaitlistEntry | null) => void;
}

/**
 * CR-151 («Постер заезда v2»), laid out to the owner's mockup by CR-155: the
 * registration card beside the hero — every registration state on one card,
 * the seats count as its big figure, and the one action. Replaces CR-119's
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
  statusTerm,
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
  footer,
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

  // CR-181: the viewer's own finish claim — only a claim, the organizer decides.
  function handleClaimFinish() {
    void run(async () => {
      const response = await claimRideFinish(rideId);
      onChange(response.registration);
      showToast(FINISH_CHECKIN_TERMS.claimSuccess);
    });
  }

  function handleWithdrawFinish() {
    void run(async () => {
      await withdrawRideFinishClaim(rideId);
      if (viewerRegistration) {
        onChange({ ...viewerRegistration, finishClaimedAt: null });
      }
      showToast(FINISH_CHECKIN_TERMS.withdrawSuccess);
    });
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

  const seats = (
    <Seats
      state={state}
      participantLimit={participantLimit}
      registrationsCount={registrationsCount}
      waitlistCount={waitlistCount}
    />
  );

  // ---- open / few / full: pick a group, register or join the queue --------
  if (state === 'open' || state === 'few' || state === 'full') {
    const full = state === 'full';
    return (
      <TicketCard
        stateKey={state}
        tone="frame"
        title={RIDE_TICKET_TERMS.startListLabel}
        status={statusTerm}
        footer={footer}
      >
        {seats}
        {hasGroups ? (
          <GroupPicker
            name="ride-group"
            legend={RIDE_TICKET_TERMS.groupLegend}
            groups={groups}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            disabled={isPending}
          />
        ) : null}
        <div className="flex flex-col gap-2.5">
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
        </div>
      </TicketCard>
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
      <TicketCard
        stateKey={state}
        tone="success"
        title={RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle}
        titleClassName="text-success"
        status={statusTerm}
        footer={footer}
      >
        {viewerStartNumber !== null || countdown ? (
          <div className="flex flex-col gap-1.5">
            {viewerStartNumber !== null ? (
              <Figure
                sign={RIDE_TICKET_TERMS.numberSign}
                value={viewerStartNumber}
              />
            ) : null}
            {countdown ? (
              <Hint>{RIDE_TICKET_TERMS.countdown(countdown)}</Hint>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Cell label={RIDE_TICKET_TERMS.dateLabel}>
            <b className="font-semibold text-text tabular-nums">{dateLabel}</b>
          </Cell>
          <Cell label={RIDE_TICKET_TERMS.startTimeLabel}>
            <b className="font-semibold text-text tabular-nums">{timeLabel}</b>
          </Cell>
        </div>
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
              <Hint>{RIDE_DETAIL_GROUP_TERMS.noGroupDescription}</Hint>
            ) : null}
            <GroupPicker
              name={`${hintId}-change-group`}
              legend={
                mustPickGroup
                  ? RIDE_DETAIL_GROUP_TERMS.noGroupTitle
                  : RIDE_DETAIL_GROUP_TERMS.changeGroup
              }
              groups={groups}
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
        {canChangeGroup && viewerGroup && !isChangingGroup ? (
          <Button
            variant="secondary"
            className="min-h-11 self-center border-0 px-3 text-body-sm text-text-secondary hover:text-text"
            onClick={() => {
              setError(null);
              setPendingGroupId(viewerGroup.id);
              setIsChangingGroup(true);
            }}
          >
            {RIDE_DETAIL_GROUP_TERMS.changeGroup}
          </Button>
        ) : null}
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
        ) : (
          <FinishCheckIn
            registration={viewerRegistration}
            isPending={isPending}
            onClaim={handleClaimFinish}
            onWithdraw={handleWithdrawFinish}
          />
        )}
        {dialogs}
      </TicketCard>
    );
  }

  // ---- waitlisted -----------------------------------------------------------
  if (state === 'waitlisted' && viewerWaitlistEntry) {
    const waitlistGroup =
      groups.find((group) => group.id === viewerWaitlistEntry.groupId) ?? null;
    return (
      <TicketCard
        stateKey={state}
        tone="frame"
        title={RIDE_TICKET_TERMS.waitlistedTitle}
        titleClassName="text-info"
        status={statusTerm}
        footer={footer}
      >
        <div className="flex flex-col gap-1.5">
          {viewerWaitlistPosition !== null ? (
            <Figure
              sign={RIDE_TICKET_TERMS.queueSign}
              value={viewerWaitlistPosition}
              className="text-info"
            />
          ) : null}
          <Hint>{RIDE_TICKET_TERMS.waitlistedHint}</Hint>
        </div>
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
      </TicketCard>
    );
  }

  // ---- cancelled ------------------------------------------------------------
  if (state === 'cancelled') {
    return (
      <TicketCard
        stateKey={state}
        tone="danger"
        title={RIDE_TICKET_TERMS.cancelledTitle}
        titleClassName="text-danger"
        status={statusTerm}
        footer={footer}
      >
        <p className="flex items-start gap-2 rounded-xl bg-danger px-3 py-2.5 text-body-sm font-medium text-on-danger">
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {RIDE_TICKET_TERMS.cancelledBanner}
        </p>
        <Hint>{RIDE_TICKET_TERMS.cancelledHint}</Hint>
      </TicketCard>
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
    <TicketCard
      stateKey={state}
      tone="frame"
      title={title}
      status={statusTerm}
      footer={footer}
    >
      {state === 'notOpen' || state === 'closed' ? seats : null}
      <Hint>{hint}</Hint>
    </TicketCard>
  );
}
