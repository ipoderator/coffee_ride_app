'use client';

import { CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type {
  Registration,
  RideGroupSummary,
  RideStatus,
  WaitlistEntry,
} from 'types';
import {
  Button,
  ConfirmDialog,
  formatGroupPace,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_GROUP_TERMS,
  RIDE_DETAIL_REGISTRATION_TERMS,
  RIDE_DETAIL_TERMS,
  StatusBadge,
  useToast,
} from 'ui';
import {
  ApiError,
  cancelRideRegistration,
  changeRegistrationGroup,
  joinRideWaitlist,
  leaveRideWaitlist,
  registerForRide,
} from '../api';
import { GroupPicker } from './GroupPicker';

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

/**
 * CR-032/CR-033 ("Register"/"Cancel registration"), CR-036 ("Waitlist"), CR-119
 * (pace groups, registered state). Rendered only while some action is possible:
 * `registration_open` (register or join the waitlist), or any status at all once
 * the viewer already has an active registration or waiting waitlist entry (both
 * cancel/leave stay available even after the organizer closes registration).
 * `viewerRegistration`/`viewerWaitlistEntry`/`registrationsCount`/`groups` come
 * from `GetRideResponse` — resolved server-side; whether the ride is "full" is
 * re-checked by the server on submit, not trusted from this client-side estimate.
 *
 * CR-103: cancelling/leaving goes through a `ConfirmDialog`, every successful
 * action shows a `Toast`.
 *
 * CR-119: when the ride has groups, registering (and joining the waitlist)
 * requires the group chosen in the page's «Группы» block (`selectedGroupId`,
 * owned by `RideDetailView` since the picker and this action sit apart — the
 * action is the sticky bar on a phone). A registered viewer gets a «Вы
 * зарегистрированы» block instead: when/where/group, «Сменить группу» (PATCH),
 * and a de-emphasized danger-outline «Отменить регистрацию».
 */
export function RegistrationButton({
  rideId,
  rideStatus,
  participantLimit,
  registrationsCount,
  viewerRegistration,
  viewerWaitlistEntry,
  groups = [],
  selectedGroupId = null,
  startLine,
  startPointLabel = null,
  groupPickerId,
  onChange,
  onWaitlistChange,
}: {
  rideId: string;
  rideStatus: RideStatus;
  participantLimit: number | null;
  registrationsCount: number;
  viewerRegistration: Registration | null;
  viewerWaitlistEntry: WaitlistEntry | null;
  groups?: RideGroupSummary[];
  selectedGroupId?: string | null;
  /** Formatted start date/time line for the registered block. */
  startLine: string;
  startPointLabel?: string | null;
  /** DOM id of the page's group picker, for the «Выберите группу» hint link. */
  groupPickerId?: string;
  onChange: (registration: Registration | null) => void;
  onWaitlistChange: (waitlistEntry: WaitlistEntry | null) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const hintId = useId();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'cancel' | 'leaveWaitlist' | null
  >(null);
  const [isChangingGroup, setIsChangingGroup] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);

  if (
    rideStatus !== 'registration_open' &&
    !viewerRegistration &&
    !viewerWaitlistEntry
  ) {
    return null;
  }

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
        router.push('/login');
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
      onChange(response.registration);
      showToast(RIDE_DETAIL_TERMS.registerSuccess);
    });
  }

  function handleJoinWaitlist() {
    if (needsGroupChoice) return;
    void run(async () => {
      // No group → the original body-less request (a ride without groups).
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

  const errorAlert = error && (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  );

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

  if (viewerRegistration) {
    const viewerGroup =
      groups.find((group) => group.id === viewerRegistration.groupId) ?? null;
    const mustPickGroup = hasGroups && viewerGroup === null;
    const canChangeGroup =
      hasGroups && rideStatus !== 'finished' && rideStatus !== 'cancelled';
    const showPicker = canChangeGroup && (mustPickGroup || isChangingGroup);

    return (
      <section
        aria-labelledby={`${hintId}-registered`}
        className="flex flex-col gap-4 rounded-xl border-[1.5px] border-success p-4"
      >
        <h2
          id={`${hintId}-registered`}
          className="flex items-center gap-2 font-display text-xl font-semibold text-success"
        >
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          {RIDE_DETAIL_REGISTRATION_TERMS.registeredTitle}
        </h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-text-secondary">
              {RIDE_DETAIL_REGISTRATION_TERMS.whenLabel}
            </dt>
            <dd className="font-display font-semibold tracking-[0.04em] text-text uppercase tabular-nums">
              {startLine}
            </dd>
          </div>
          {startPointLabel && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-text-secondary">
                {RIDE_DETAIL_REGISTRATION_TERMS.startLabel}
              </dt>
              <dd className="text-text">{startPointLabel}</dd>
            </div>
          )}
        </dl>

        {viewerGroup && !isChangingGroup && (
          <div className="flex flex-col items-start gap-3 border-t border-border pt-3">
            <p className="text-base font-medium text-text">
              {RIDE_DETAIL_GROUP_TERMS.ridingIn(
                viewerGroup.name,
                formatGroupPace(viewerGroup.paceKmh),
              )}
            </p>
            {canChangeGroup && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setPendingGroupId(viewerGroup.id);
                  setIsChangingGroup(true);
                }}
              >
                {RIDE_DETAIL_GROUP_TERMS.changeGroup}
              </Button>
            )}
          </div>
        )}

        {showPicker && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {mustPickGroup && (
              <p className="text-sm text-text-secondary">
                {RIDE_DETAIL_GROUP_TERMS.noGroupDescription}
              </p>
            )}
            <GroupPicker
              groups={groups}
              name={`${hintId}-change-group`}
              value={pendingGroupId}
              onChange={setPendingGroupId}
              legend={
                mustPickGroup
                  ? RIDE_DETAIL_GROUP_TERMS.noGroupTitle
                  : RIDE_DETAIL_GROUP_TERMS.changeGroup
              }
              disabled={isPending}
              viewerGroupId={viewerGroup?.id ?? null}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                isLoading={isPending}
                disabled={!pendingGroupId || pendingGroupId === viewerGroup?.id}
                onClick={handleSaveGroup}
              >
                {RIDE_DETAIL_GROUP_TERMS.saveGroup}
              </Button>
              {!mustPickGroup && (
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
              )}
            </div>
          </div>
        )}

        {errorAlert}

        <div className="border-t border-border pt-3">
          <Button
            variant="danger"
            isLoading={isPending && confirmAction === 'cancel'}
            disabled={isPending}
            onClick={() => setConfirmAction('cancel')}
          >
            {REGISTRATION_ACTION_TERMS.cancel}
          </Button>
        </div>
        {dialogs}
      </section>
    );
  }

  if (viewerWaitlistEntry) {
    const waitlistGroup =
      groups.find((group) => group.id === viewerWaitlistEntry.groupId) ?? null;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={REGISTRATION_ACTION_TERMS.waitlisted}
            tone="warning"
          />
          {waitlistGroup && (
            <span className="text-sm text-text-secondary">
              {waitlistGroup.name} · {formatGroupPace(waitlistGroup.paceKmh)}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          isLoading={isPending}
          onClick={() => setConfirmAction('leaveWaitlist')}
        >
          {REGISTRATION_ACTION_TERMS.leaveWaitlist}
        </Button>
        {errorAlert}
        {dialogs}
      </div>
    );
  }

  const isFull =
    participantLimit !== null && registrationsCount >= participantLimit;
  const seatsLeft =
    participantLimit !== null
      ? Math.max(participantLimit - registrationsCount, 0)
      : null;

  return (
    <div className="flex flex-col gap-2">
      {seatsLeft !== null && (
        <p className="font-display text-sm font-semibold tracking-[0.04em] text-text-secondary uppercase tabular-nums">
          {isFull
            ? REGISTRATION_ACTION_TERMS.full
            : RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(seatsLeft)}
        </p>
      )}
      <Button
        className="w-full"
        isLoading={isPending}
        disabled={needsGroupChoice}
        aria-describedby={needsGroupChoice ? hintId : undefined}
        onClick={isFull ? handleJoinWaitlist : handleRegister}
      >
        {isFull
          ? REGISTRATION_ACTION_TERMS.joinWaitlist
          : REGISTRATION_ACTION_TERMS.register}
      </Button>
      {needsGroupChoice && (
        <p id={hintId} className="text-sm text-text-secondary">
          {groupPickerId ? (
            <a
              href={`#${groupPickerId}`}
              className="underline decoration-1 underline-offset-2 hover:text-text"
            >
              {RIDE_DETAIL_GROUP_TERMS.pickHint}
            </a>
          ) : (
            RIDE_DETAIL_GROUP_TERMS.pickHint
          )}
        </p>
      )}
      {errorAlert}
    </div>
  );
}
