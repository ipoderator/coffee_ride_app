'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Registration, RideStatus, WaitlistEntry } from 'types';
import {
  Button,
  ConfirmDialog,
  REGISTRATION_ACTION_TERMS,
  RIDE_DETAIL_TERMS,
  useToast,
} from 'ui';
import {
  ApiError,
  cancelRideRegistration,
  joinRideWaitlist,
  leaveRideWaitlist,
  registerForRide,
} from '../api';

/**
 * CR-032/CR-033 ("Register"/"Cancel registration"), CR-036 ("Waitlist"). Rendered only
 * while some action is possible: `registration_open` (register or join the waitlist),
 * or any status at all once the viewer already has an active registration or waiting
 * waitlist entry (both cancel/leave stay available even after the organizer closes
 * registration — `.claude/context/current-task.md`'s scope decision, extended
 * unchanged from CR-032/033 to the waitlist). `viewerRegistration`/
 * `viewerWaitlistEntry`/`registrationsCount` come from `GetRideResponse` — resolved
 * server-side, never re-derived client-side; in particular, whether the ride is
 * "full" enough to offer joining the waitlist is re-checked by the server on submit,
 * not trusted from this client-side estimate.
 *
 * CR-103 (`/impeccable critique` P0): cancelling a registration/leaving the waitlist
 * now goes through a `ConfirmDialog` instead of firing on the first click, and every
 * successful action shows a `Toast` — the product's own stated context
 * (`docs/product.md`: checking a ride pre-dawn, gloves on) is exactly where a mis-tap
 * with no confirm/undo hurts most.
 */
export function RegistrationButton({
  rideId,
  rideStatus,
  participantLimit,
  registrationsCount,
  viewerRegistration,
  viewerWaitlistEntry,
  onChange,
  onWaitlistChange,
}: {
  rideId: string;
  rideStatus: RideStatus;
  participantLimit: number | null;
  registrationsCount: number;
  viewerRegistration: Registration | null;
  viewerWaitlistEntry: WaitlistEntry | null;
  onChange: (registration: Registration | null) => void;
  onWaitlistChange: (waitlistEntry: WaitlistEntry | null) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'cancel' | 'leaveWaitlist' | null
  >(null);

  if (
    rideStatus !== 'registration_open' &&
    !viewerRegistration &&
    !viewerWaitlistEntry
  ) {
    return null;
  }

  async function handleRegister() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      const response = await registerForRide(rideId);
      onChange(response.registration);
      showToast(RIDE_DETAIL_TERMS.registerSuccess);
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'unauthorized') {
        router.push('/login');
        return;
      }
      setError(RIDE_DETAIL_TERMS.registrationActionError);
    } finally {
      setIsPending(false);
    }
  }

  async function handleConfirmCancel() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      await cancelRideRegistration(rideId);
      onChange(null);
      setConfirmAction(null);
      showToast(RIDE_DETAIL_TERMS.cancelSuccess);
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'unauthorized') {
        router.push('/login');
        return;
      }
      setConfirmAction(null);
      setError(RIDE_DETAIL_TERMS.registrationActionError);
    } finally {
      setIsPending(false);
    }
  }

  async function handleJoinWaitlist() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      const response = await joinRideWaitlist(rideId);
      onWaitlistChange(response.waitlistEntry);
      showToast(RIDE_DETAIL_TERMS.joinWaitlistSuccess);
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'unauthorized') {
        router.push('/login');
        return;
      }
      setError(RIDE_DETAIL_TERMS.registrationActionError);
    } finally {
      setIsPending(false);
    }
  }

  async function handleConfirmLeaveWaitlist() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      await leaveRideWaitlist(rideId);
      onWaitlistChange(null);
      setConfirmAction(null);
      showToast(RIDE_DETAIL_TERMS.leaveWaitlistSuccess);
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'unauthorized') {
        router.push('/login');
        return;
      }
      setConfirmAction(null);
      setError(RIDE_DETAIL_TERMS.registrationActionError);
    } finally {
      setIsPending(false);
    }
  }

  const isFull =
    !viewerRegistration &&
    participantLimit !== null &&
    registrationsCount >= participantLimit;

  return (
    <div className="flex flex-col gap-2">
      {viewerRegistration ? (
        <Button
          variant="secondary"
          isLoading={isPending}
          onClick={() => setConfirmAction('cancel')}
        >
          {REGISTRATION_ACTION_TERMS.cancel}
        </Button>
      ) : viewerWaitlistEntry ? (
        <>
          <Button variant="secondary" disabled>
            {REGISTRATION_ACTION_TERMS.waitlisted}
          </Button>
          <Button
            variant="secondary"
            isLoading={isPending}
            onClick={() => setConfirmAction('leaveWaitlist')}
          >
            {REGISTRATION_ACTION_TERMS.leaveWaitlist}
          </Button>
        </>
      ) : isFull ? (
        <Button isLoading={isPending} onClick={handleJoinWaitlist}>
          {REGISTRATION_ACTION_TERMS.joinWaitlist}
        </Button>
      ) : (
        <Button isLoading={isPending} onClick={handleRegister}>
          {REGISTRATION_ACTION_TERMS.register}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
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
    </div>
  );
}
