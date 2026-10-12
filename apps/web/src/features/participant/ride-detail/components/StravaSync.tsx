'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STRAVA_SYNC_OUTCOMES, type StravaSyncOutcome } from 'types';
import {
  FINISH_CHECKIN_TERMS,
  STRAVA_SYNC_TERMS,
  StravaVerifiedBadge,
  useToast,
} from 'ui';
import { loginHref } from '@/lib/auth/next-path';
import { ApiError, getStravaStatus, startStravaSync } from '../api';
import { StravaConnectMark } from './StravaConnectMark';
import { StravaPoweredByMark } from './StravaPoweredByMark';

// CR-234 (ADR-033): Strava's «Connect with Strava» button on the finish check-in. The
// browser leaves for Strava's consent screen and comes back to this ride page
// with `?strava=<outcome>`, which `useStravaOutcomeToast` turns into a toast.

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
 */
export function StravaSyncButton({
  rideId,
  disabled = false,
}: {
  rideId: string;
  disabled?: boolean;
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
        {STRAVA_SYNC_TERMS.syncHint}
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

function isOutcome(value: string | null): value is StravaSyncOutcome {
  return (STRAVA_SYNC_OUTCOMES as readonly (string | null)[]).includes(value);
}

/**
 * Reads `?strava=` once after the callback's redirect, shows the outcome and
 * drops the parameter so a reload doesn't repeat the toast.
 */
export function useStravaOutcomeToast() {
  const { showToast } = useToast();
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('strava');
    if (!isOutcome(outcome)) return;
    showToast(
      STRAVA_SYNC_TERMS.outcome[outcome],
      outcome === 'verified' ? 'success' : 'danger',
    );
    url.searchParams.delete('strava');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [showToast]);
}
