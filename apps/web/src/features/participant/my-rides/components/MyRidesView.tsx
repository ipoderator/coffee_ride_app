'use client';

import { useEffect, useState } from 'react';
import type { MyRegistrationSummary } from 'types';
import { EmptyState, ErrorState, MY_REGISTRATIONS_TERMS, Skeleton } from 'ui';
import { listMyRegistrations } from '../api';
import { MyRideCard } from './MyRideCard';
import {
  MyRegistrationsTabs,
  type RegistrationsTab,
} from './MyRegistrationsTabs';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/me/rides` (CR-091, `docs/design.md` §8 "My registrations — Upcoming / past
 * tabs", `.claude/context/current-task.md`). Two independently-fetched,
 * server-filtered tabs (`GET /v1/registrations/mine?when=`) rather than one page
 * split client-side — each keeps its own loading/error/empty state, switching tabs
 * never blocks on the other's fetch. Fetches one page per tab, same "no load more
 * yet" precedent `DiscoveryList`/`RidesList` already established. Read-only — no
 * cancel action here, that stays on each ride's own `/rides/[id]` page.
 */
export function MyRidesView() {
  const [tab, setTab] = useState<RegistrationsTab>('upcoming');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<MyRegistrationSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    listMyRegistrations({ when: tab })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const tabs = <MyRegistrationsTabs tab={tab} onChange={setTab} />;
  const emptyTitle =
    tab === 'upcoming'
      ? MY_REGISTRATIONS_TERMS.emptyUpcomingTitle
      : MY_REGISTRATIONS_TERMS.emptyPastTitle;
  const emptyDescription =
    tab === 'upcoming'
      ? MY_REGISTRATIONS_TERMS.emptyUpcomingDescription
      : MY_REGISTRATIONS_TERMS.emptyPastDescription;

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <ErrorState message={MY_REGISTRATIONS_TERMS.loadError} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {tabs}
      {items.map((item) => (
        <MyRideCard key={item.registration.id} item={item} />
      ))}
    </div>
  );
}
