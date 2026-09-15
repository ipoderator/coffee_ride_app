'use client';

import { useEffect, useState } from 'react';
import type { PublicRide } from 'types';
import { EmptyState, ErrorState, RIDE_DISCOVERY_TERMS, Skeleton } from 'ui';
import { listPublicRides } from '../api';
import { RideCard } from './RideCard';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/` (CR-024, `docs/design.md` §8 "Discovery" — the list-only slice of it, no map
 * toggle/filters yet, CR-026/CR-025). No session cookie sent — `GET /v1/rides` is
 * fully public and only ever returns non-`draft` rides. Fetches one page, same "no
 * load more yet" precedent `RidesList` (CR-088) established.
 */
export function DiscoveryList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRide[]>([]);

  useEffect(() => {
    let cancelled = false;

    listPublicRides()
      .then((response) => {
        if (cancelled) return;
        setRides(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={RIDE_DISCOVERY_TERMS.loadError} />;
  }

  if (rides.length === 0) {
    return (
      <EmptyState
        title={RIDE_DISCOVERY_TERMS.emptyTitle}
        description={RIDE_DISCOVERY_TERMS.emptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rides.map((ride) => (
        <RideCard key={ride.id} ride={ride} />
      ))}
    </div>
  );
}
