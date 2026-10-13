import { useEffect, useState } from 'react';
import { STRAVA_SYNC_OUTCOMES, type StravaSyncOutcome } from 'types';
import { STRAVA_SYNC_TERMS, useToast, type ToastTone } from 'ui';

// CR-234 (ADR-033): the Strava callback lands on the ride page — or on `/me/rides`
// when its `state` can't be trusted — with `?strava=<outcome>`. Shared by both pages,
// so it lives here rather than in either feature module.

// Nothing went wrong when the participant cancelled or simply took too long.
const NEUTRAL_OUTCOMES: ReadonlySet<StravaSyncOutcome> = new Set([
  'cancelled',
  'expired',
]);

function isOutcome(value: string | null): value is StravaSyncOutcome {
  return (STRAVA_SYNC_OUTCOMES as readonly (string | null)[]).includes(value);
}

function outcomeTone(outcome: StravaSyncOutcome): ToastTone {
  if (outcome === 'verified') return 'success';
  return NEUTRAL_OUTCOMES.has(outcome) ? 'info' : 'danger';
}

/**
 * Reads `?strava=` once after the callback's redirect, shows the outcome and drops
 * the parameter so a reload doesn't repeat the toast. Returns the outcome, so the
 * page can tell a participant who just came back from Strava from a first visit.
 */
export function useStravaOutcomeToast(): StravaSyncOutcome | null {
  const { showToast } = useToast();
  const [outcome, setOutcome] = useState<StravaSyncOutcome | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('strava');
    if (!isOutcome(value)) return;
    showToast(STRAVA_SYNC_TERMS.outcome[value], outcomeTone(value));
    setOutcome(value);
    url.searchParams.delete('strava');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [showToast]);
  return outcome;
}
