'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
 * CR-026 ("Map discovery"): the map view renders `RideMapPlaceholder` — no live
 * 2GIS credential exists in this environment (KI-016), so a real map render would
 * be unverifiable (`.claude/context/current-task.md`'s investigation). Switching to
 * "Карта" does not refetch or otherwise change the underlying list/filter state.
 *
 * CR-044 (`docs/design.md` §11: "lg: Discovery becomes split list + map"): both
 * panels are always mounted — the inactive one is gated behind `hidden lg:block`
 * rather than left out of the DOM, so it's already there, just unhidden by CSS, the
 * moment the viewport crosses `lg`. The toggle itself hides at `lg`+
 * (`className="lg:hidden"`) since there's no longer a single active view to pick.
 */
export function DiscoveryList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRide[]>([]);
  const [bicycleType, setBicycleType] = useState<BicycleType | undefined>(
    undefined,
  );
  const [view, setView] = useState<DiscoveryView>('list');
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

  const filters = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <RideFilters bicycleType={bicycleType} onChange={setBicycleType} />
      <DiscoveryViewToggle
        view={view}
        onChange={setView}
        className="lg:hidden"
      />
    </div>
  );

  let listPanel: ReactNode;
  if (status === 'loading') {
    listPanel = (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (status === 'error') {
    listPanel = (
      <ErrorState
        message={RIDE_DISCOVERY_TERMS.loadError}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  } else if (rides.length === 0) {
    listPanel = bicycleType ? (
      <EmptyState
        title={RIDE_DISCOVERY_TERMS.emptyFilteredTitle}
        action={
          <Button variant="secondary" onClick={() => setBicycleType(undefined)}>
            {RIDE_DISCOVERY_TERMS.resetFiltersLabel}
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={RIDE_DISCOVERY_TERMS.emptyTitle}
        description={RIDE_DISCOVERY_TERMS.emptyDescription}
      />
    );
  } else {
    listPanel = (
      <div className="flex flex-col gap-4">
        {rides.map((ride) => (
          <RideCard key={ride.id} ride={ride} />
        ))}
      </div>
    );
  }

  // CR-044: both panels stay mounted; only the inactive one is CSS-hidden below
  // `lg` (`docs/design.md` §11's split view). Above `lg` neither carries the
  // `hidden` class, so both render side by side regardless of `view`.
  return (
    <div className="flex flex-col gap-4">
      {filters}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div
          data-testid="discovery-list-panel"
          className={view === 'map' ? 'hidden lg:block' : undefined}
        >
          {listPanel}
        </div>
        <div
          data-testid="discovery-map-panel"
          className={view === 'list' ? 'hidden lg:block' : undefined}
        >
          <RideMapPlaceholder />
        </div>
      </div>
    </div>
  );
}
