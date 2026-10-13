'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FINISH_CHECKIN_TERMS,
  STRAVA_SYNC_TERMS,
  StravaVerifiedBadge,
} from 'ui';
import { loginHref } from '@/lib/auth/next-path';
import { ApiError, getStravaStatus, startStravaSync } from '../api';
import { StravaConnectMark } from './StravaConnectMark';
import { StravaPoweredByMark } from './StravaPoweredByMark';

// CR-234 (ADR-033): Strava's «Connect with Strava» button on the finish check-in. The
// browser leaves for Strava's consent screen and comes back to this ride page
// with `?strava=<outcome>`, which `useStravaOutcomeToast` (`lib/strava`) turns into
// a toast.

// One status request per page load, shared by every mounted button.
let statusRequest: Promise<boolean> | null = null;

function useStravaAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    statusRequest ??= getStravaStatus().then((status) => status.available);
    void statusRequest.then((value) => {
      if (!cancelled) setAvailable(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

/** Test/story seam: forget the cached status between cases. */
export function resetStravaStatusCache() {
  statusRequest = null;
}

function startErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.problem.code) {
      case 'attendance_already_decided':
        return FINISH_CHECKIN_TERMS.alreadyDecided;
      case 'ride_not_in_progress':
        return FINISH_CHECKIN_TERMS.rideNotInProgress;
      case 'strava_unavailable':
        return STRAVA_SYNC_TERMS.outcome.unavailable;
    }
  }
  return STRAVA_SYNC_TERMS.startError;
}

/**
 * The button plus its hint; renders nothing while the server's Strava status is
 * unknown or off, so a ride page without the integration looks exactly as before.
 * `retry`: the participant has just come back from Strava without a verified ride.
 * The grant is one-shot (ADR-033), so Strava never stays «connected» and asks again
 * — the copy says so instead of offering the same «Connect» as on a first visit.
 */
export function StravaSyncButton({
  rideId,
  disabled = false,
  retry = false,
}: {
  rideId: string;
  disabled?: boolean;
  retry?: boolean;
}) {
  const router = useRouter();
  const available = useStravaAvailable();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  async function handleSync() {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const { authorizeUrl } = await startStravaSync(rideId);
      window.location.assign(authorizeUrl);
    } catch (err) {
      setIsPending(false);
      if (err instanceof ApiError && err.problem.code === 'unauthorized') {
        router.push(loginHref(`/rides/${rideId}`));
        return;
      }
      setError(startErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="strava-sync">
      {retry ? (
        <b className="font-semibold text-text">
          {STRAVA_SYNC_TERMS.retryTitle}
        </b>
      ) : null}
      {/* Strava's brand guidelines require their own button for the OAuth hand-off. */}
      <button
        type="button"
        aria-label={STRAVA_SYNC_TERMS.connectButton}
        aria-busy={isPending}
        disabled={disabled || isPending}
        onClick={() => void handleSync()}
        className="self-start rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <StravaConnectMark />
      </button>
      <p className="text-body-sm text-text-secondary">
        {retry ? STRAVA_SYNC_TERMS.retryHint : STRAVA_SYNC_TERMS.syncHint}
      </p>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The participant's own view of a verified finish, with a link to their ride. */
export function StravaVerifiedNote({ activityId }: { activityId: string }) {
  return (
    <div className="flex flex-col gap-2" data-testid="strava-verified">
      <StravaVerifiedBadge className="self-start" />
      <p className="text-body-sm text-text-secondary">
        {STRAVA_SYNC_TERMS.verifiedHint}
      </p>
      <a
        href={`https://www.strava.com/activities/${activityId}`}
        target="_blank"
        rel="noopener noreferrer"
        // Strava's guidelines: a «View on Strava» link is bold, underlined or orange.
        className="self-start rounded-sm text-body-sm font-semibold text-strava-text underline decoration-1 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {STRAVA_SYNC_TERMS.openActivity}
      </a>
      <StravaPoweredByMark />
    </div>
  );
}
