'use client';

import { useEffect, useState } from 'react';
import type { OrganizerRideSummary } from 'types';
import {
  Card,
  ErrorState,
  MetricRow,
  MetricTile,
  RIDE_SUMMARY_WIDGET_TERMS,
  Skeleton,
} from 'ui';
import { getOwnRideSummary } from '../api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: OrganizerRideSummary };

/**
 * `/organizer` dashboard widget (CR-103, `/impeccable critique` P1 — "no ride/
 * registration/waitlist counts anywhere in the organizer cabinet"). Registers into
 * `ORGANIZER_WIDGETS` (`@/lib/cabinet/organizer-widgets.ts`) via
 * `organizerRideSummaryWidget` in `../nav.ts`, same pattern as
 * `OrganizerProfileWidget`. Zero rides is a legitimate ready state (all-zero tiles),
 * not a distinct empty state — `RidesList`'s own `/organizer/rides` screen already
 * owns the "create your first ride" empty-state/CTA.
 */
export function RideSummaryWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getOwnRideSummary()
      .then((response) => {
        if (cancelled) return;
        setState({ status: 'ready', summary: response.summary });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: RIDE_SUMMARY_WIDGET_TERMS.loadError,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <Card aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-8">
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
        </div>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <ErrorState
          message={state.message}
          variant="inline"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </Card>
    );
  }

  const { summary } = state;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-text">
        {RIDE_SUMMARY_WIDGET_TERMS.title}
      </h2>
      <MetricRow>
        <MetricTile
          label={RIDE_SUMMARY_WIDGET_TERMS.totalRidesLabel}
          value={String(summary.totalRides)}
        />
        <MetricTile
          label={RIDE_SUMMARY_WIDGET_TERMS.openRegistrationLabel}
          value={String(summary.openRegistrationRides)}
        />
        <MetricTile
          label={RIDE_SUMMARY_WIDGET_TERMS.activeRegistrationsLabel}
          value={String(summary.activeRegistrations)}
        />
        <MetricTile
          label={RIDE_SUMMARY_WIDGET_TERMS.waitlistedLabel}
          value={String(summary.waitlisted)}
        />
      </MetricRow>
    </Card>
  );
}
