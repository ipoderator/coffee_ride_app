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
import { DiscoveryViewToggle, type DiscoveryView } from './DiscoveryViewToggle';
import { RideMapPlaceholder } from './RideMapPlaceholder';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/` (CR-024, `docs/design.md` §8 "Discovery"; CR-026 adds the List/Map toggle). No
 * session cookie sent — `GET /v1/rides` is fully public and only ever returns
 * upcoming, non-`draft` rides. Fetches one page, same "no load more yet" precedent
 * `RidesList` (CR-088) established.
 *
 * CR-025 ("Filters") adds `bicycleType` as the one filter dimension this ticket
 * ships (`.claude/context/current-task.md`) — `RideFilters` stays visible in every
 * state (loading/error/empty/success) so changing it is never blocked. A filtered
 * empty result uses `emptyFilteredTitle` ("Пока нет заездов по этим фильтрам",
 * `docs/design.md` §10's own example) with a "Сбросить фильтры" action; an
 * unfiltered empty result keeps the plain `emptyTitle`.
 *
 * CR-026 ("Map discovery"): `DiscoveryViewToggle` is likewise always visible. The map
 * view renders `RideMapPlaceholder` — no live 2GIS credential exists in this
 * environment (KI-016), so a real map render would be unverifiable
 * (`.claude/context/current-task.md`'s investigation). Switching to "Карта" does not
 * refetch or otherwise change the underlying list/filter state.
 */
export function DiscoveryList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRide[]>([]);
  const [bicycleType, setBicycleType] = useState<BicycleType | undefined>(
    undefined,
  );
  const [view, setView] = useState<DiscoveryView>('list');

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

  const controls = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <RideFilters bicycleType={bicycleType} onChange={setBicycleType} />
      <DiscoveryViewToggle view={view} onChange={setView} />
    </div>
  );

  // CR-026: the map view doesn't depend on the list's own load status — it's a
  // fixed degraded notice regardless of whether the list is loading/ready/errored
  // (`.claude/context/current-task.md`).
  if (view === 'map') {
    return (
      <div className="flex flex-col gap-4">
        {controls}
        <RideMapPlaceholder />
      </div>
    );
  }

  const filters = controls;

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
