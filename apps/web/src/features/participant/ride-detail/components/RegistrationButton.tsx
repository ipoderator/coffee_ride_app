'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Registration, RideStatus } from 'types';
import { Button, REGISTRATION_ACTION_TERMS, RIDE_DETAIL_TERMS } from 'ui';
import { ApiError, cancelRideRegistration, registerForRide } from '../api';

/**
 * CR-032/CR-033 ("Register"/"Cancel registration"). Rendered only while a
 * registration action is possible: `registration_open` (register), or any status at
 * all once the viewer already has an active registration (cancel stays available even
 * after the organizer closes registration — `.claude/context/current-task.md`'s scope
 * decision: no extra gating on cancel beyond "an active registration exists").
 * `viewerRegistration`/`registrationsCount` come from `GetRideResponse` — resolved
 * server-side, never re-derived client-side.
 */
export function RegistrationButton({
  rideId,
  rideStatus,
  participantLimit,
  registrationsCount,
  viewerRegistration,
  onChange,
}: {
  rideId: string;
  rideStatus: RideStatus;
  participantLimit: number | null;
  registrationsCount: number;
  viewerRegistration: Registration | null;
  onChange: (registration: Registration | null) => void;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rideStatus !== 'registration_open' && !viewerRegistration) {
    return null;
  }

  async function handleRegister() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      const response = await registerForRide(rideId);
      onChange(response.registration);
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

  async function handleCancel() {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    try {
      await cancelRideRegistration(rideId);
      onChange(null);
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
          onClick={handleCancel}
        >
          {REGISTRATION_ACTION_TERMS.cancel}
        </Button>
      ) : isFull ? (
        <Button variant="secondary" disabled>
          {REGISTRATION_ACTION_TERMS.full}
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
    </div>
  );
}
