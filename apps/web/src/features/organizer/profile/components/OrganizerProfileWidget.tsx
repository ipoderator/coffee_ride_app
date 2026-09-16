'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { OrganizerProfile } from 'types';
import { Card, EmptyState, ErrorState, ORGANIZER_TERMS, Skeleton } from 'ui';
import { ApiError, getOrganizerProfile } from '../api';

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: OrganizerProfile };

/**
 * `/organizer` dashboard widget (CR-015, `docs/design.md` §8: "Dashboard
 * (widgets from the ADR-009 registry)"). Registers into `ORGANIZER_WIDGETS`
 * (`@/lib/cabinet/organizer-widgets.ts`) via `organizerProfileWidget` in
 * `../nav.ts` — the widget owns its own data fetching/states, same as
 * `OrganizerProfileForm` reuses the same `getOrganizerProfile()` call.
 *
 * Read-only summary, distinct from the `/organizer/profile` form: no create/
 * edit UI here, only a link into that screen (empty state → "create", ready
 * state → "edit"), same split `ErrorState`/`EmptyState` already establish
 * elsewhere in this cabinet.
 */
export function OrganizerProfileWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getOrganizerProfile()
      .then((response) => {
        if (cancelled) return;
        setState({ status: 'ready', profile: response.organizerProfile });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.problem.status === 404) {
          setState({ status: 'empty' });
          return;
        }
        setState({ status: 'error', message: ORGANIZER_TERMS.loadError });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <Card aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
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

  if (state.status === 'empty') {
    return (
      <Card>
        <EmptyState
          title={ORGANIZER_TERMS.dashboardWidgetEmptyTitle}
          description={ORGANIZER_TERMS.dashboardWidgetEmptyDescription}
          action={
            <Link
              href="/organizer/profile"
              className="text-sm font-medium text-primary hover:underline"
            >
              {ORGANIZER_TERMS.dashboardWidgetCreateLink}
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-medium text-text">
        {ORGANIZER_TERMS.dashboardWidgetTitle}
      </h2>
      <p className="text-sm font-medium text-text">{state.profile.name}</p>
      {state.profile.description ? (
        <p className="text-sm text-text-secondary">
          {state.profile.description}
        </p>
      ) : null}
      <Link
        href="/organizer/profile"
        className="self-start text-sm font-medium text-primary hover:underline"
      >
        {ORGANIZER_TERMS.dashboardWidgetEditLink}
      </Link>
    </Card>
  );
}
