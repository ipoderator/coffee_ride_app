'use client';

import { Send } from 'lucide-react';
import Link from 'next/link';
import {
  buttonClassName,
  Card,
  EmptyState,
  ErrorState,
  ORGANIZER_OVERVIEW_TERMS,
  ORGANIZER_TERMS,
  Skeleton,
} from 'ui';
import { useOverviewData } from '../hooks/useOverviewData';

/**
 * `/organizer` (CR-131, ADR-024 mockup screen 4): the dashboard's head — the
 * organizer's name, a time-of-day greeting, «Отправить обновление» for the
 * nearest ride. CR-185 split the mockup's four KPI cells off into
 * {@link OrganizerKpiWidget}, registered after the live rides (handoff:
 * active work above the statistics); both read one shared load
 * (`useOverviewData`). The no-profile and error states live here, at the
 * top of the page; the KPI row renders nothing in either.
 */
export function OrganizerOverviewWidget() {
  const { state, retry } = useOverviewData();

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="col-span-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-64" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <Card className="col-span-full">
        <ErrorState
          message={ORGANIZER_OVERVIEW_TERMS.loadError}
          variant="inline"
          onRetry={retry}
        />
      </Card>
    );
  }

  if (state.status === 'noProfile') {
    return (
      <Card className="col-span-full">
        <EmptyState
          title={ORGANIZER_TERMS.dashboardWidgetEmptyTitle}
          description={ORGANIZER_TERMS.dashboardWidgetEmptyDescription}
          action={
            <Link href="/organizer/profile" className={buttonClassName()}>
              {ORGANIZER_TERMS.dashboardWidgetCreateLink}
            </Link>
          }
        />
      </Card>
    );
  }

  const { now, profile, nearest } = state;

  return (
    <div className="col-span-full flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-mono text-label text-text-secondary uppercase">
          {profile.organizerProfile.name}
        </p>
        <p className="font-title text-h1 text-text">
          {ORGANIZER_OVERVIEW_TERMS.greeting(now.getHours())}
        </p>
      </div>
      {nearest && (
        <Link
          href={`/organizer/rides/${nearest.id}/updates`}
          className={buttonClassName('secondary')}
        >
          <Send className="size-4" aria-hidden="true" />
          {ORGANIZER_OVERVIEW_TERMS.sendUpdate}
        </Link>
      )}
    </div>
  );
}
