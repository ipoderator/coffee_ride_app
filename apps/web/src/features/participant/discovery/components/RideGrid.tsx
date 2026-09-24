'use client';

import { useEffect, useState } from 'react';
import type { BicycleType, PublicRideListItem } from 'types';
import {
  Button,
  EmptyState,
  ErrorState,
  RIDE_DISCOVERY_TERMS,
  Skeleton,
} from 'ui';
import { listPublicRides } from '../api';
import { ContoursIllustration } from './ContoursIllustration';
import { RideFilters } from './RideFilters';
import { RideGridCard } from './RideGridCard';

type LoadStatus = 'loading' | 'ready' | 'error';

function LoadingCards() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Skeleton key={index} className="h-64 rounded-3xl" />
      ))}
    </div>
  );
}

/**
 * ADR-024's "Заезды" tab: the route-cover grid, sharing `listPublicRides` and
 * the bicycle-type filter with `DiscoveryList` (the "Карта" tab) but with its
 * own fetch — each tab only pays for the data its own view needs, and the two
 * views don't have to agree on layout to share the underlying list.
 */
export function RideGrid() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRideListItem[]>([]);
  const [bicycleType, setBicycleType] = useState<BicycleType | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);

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
  }, [bicycleType, attempt]);

  return (
    <div className="mx-auto w-full max-w-300 px-4 py-6 lg:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-title text-4xl leading-none font-semibold text-text">
          {RIDE_DISCOVERY_TERMS.pageTitle}
        </h1>
        <RideFilters bicycleType={bicycleType} onChange={setBicycleType} />
      </div>

      <div aria-busy={status === 'loading'}>
        {status === 'loading' ? (
          <LoadingCards />
        ) : status === 'error' ? (
          <ErrorState
            message={RIDE_DISCOVERY_TERMS.loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : rides.length === 0 ? (
          bicycleType ? (
            <EmptyState
              icon={<ContoursIllustration />}
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
              icon={<ContoursIllustration />}
              title={RIDE_DISCOVERY_TERMS.emptyTitle}
              description={RIDE_DISCOVERY_TERMS.emptyDescription}
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rides.map((ride) => (
              <RideGridCard key={ride.id} ride={ride} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
