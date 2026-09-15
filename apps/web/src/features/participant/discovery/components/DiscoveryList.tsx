'use client';

import { useEffect, useState } from 'react';
import type { BicycleType, PublicRide } from 'types';
import {
  Button,
  EmptyState,
  ErrorState,
  RIDE_DISCOVERY_TERMS,
  Skeleton,
} from 'ui';
import { listPublicRides } from '../api';
import { RideCard } from './RideCard';
import { RideFilters } from './RideFilters';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/` (CR-024, `docs/design.md` §8 "Discovery" — the list-only slice of it; the map
 * toggle is CR-026). No session cookie sent — `GET /v1/rides` is fully public and
 * only ever returns upcoming, non-`draft` rides. Fetches one page, same "no load
 * more yet" precedent `RidesList` (CR-088) established.
 *
 * CR-025 ("Filters") adds `bicycleType` as the one filter dimension this ticket
 * ships (`.claude/context/current-task.md`) — `RideFilters` stays visible in every
 * state (loading/error/empty/success) so changing it is never blocked. A filtered
 * empty result uses `emptyFilteredTitle` ("Пока нет заездов по этим фильтрам",
 * `docs/design.md` §10's own example) with a "Сбросить фильтры" action; an
 * unfiltered empty result keeps the plain `emptyTitle`.
 */
export function DiscoveryList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRide[]>([]);
  const [bicycleType, setBicycleType] = useState<BicycleType | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    listPublicRides({ bicycleType })
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
  }, [bicycleType]);

  const filters = (
    <RideFilters bicycleType={bicycleType} onChange={setBicycleType} />
  );

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        {filters}
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {filters}
        <ErrorState message={RIDE_DISCOVERY_TERMS.loadError} />
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {filters}
        {bicycleType ? (
          <EmptyState
            title={RIDE_DISCOVERY_TERMS.emptyFilteredTitle}
            action={
              <Button
                variant="secondary"
                onClick={() => setBicycleType(undefined)}
              >
                {RIDE_DISCOVERY_TERMS.resetFiltersLabel}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={RIDE_DISCOVERY_TERMS.emptyTitle}
            description={RIDE_DISCOVERY_TERMS.emptyDescription}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filters}
      {rides.map((ride) => (
        <RideCard key={ride.id} ride={ride} />
      ))}
    </div>
  );
}
