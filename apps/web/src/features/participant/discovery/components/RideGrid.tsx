'use client';

import { type HTMLAttributes, type ReactNode, useId, useMemo } from 'react';
import Link from 'next/link';
import {
  Button,
  ContoursIllustration,
  EmptyState,
  ErrorState,
  RIDE_DISCOVERY_TERMS,
} from 'ui';
import {
  NO_DISCOVERY_FILTERS,
  hasActiveFilters,
} from '../lib/discovery-filters';
import {
  useDiscoveryFilters,
  type DiscoveryFiltersControl,
} from '../lib/use-discovery-filters';
import { usePublicRides } from '../lib/use-public-rides';
import { pickFeaturedRide } from '../lib/ride-metrics';
import { ArchivedRidesSection } from './ArchivedRidesSection';
import { DiscoveryFilters } from './DiscoveryFilters';
import { DiscoveryGridSkeleton } from './DiscoveryPageSkeleton';
import { FeaturedRideCard } from './FeaturedRideCard';
import { RideGridCard } from './RideGridCard';
import { ShowMoreRides } from './ShowMoreRides';

const GRID_CLASSNAME =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5';

/**
 * ADR-024's «Список» tab, laid out to the owner's mockup in CR-153: page
 * intro, filter chips with the total, the featured «Ближайший» card, then
 * «Все заезды» as compact cards and «Показать ещё N заездов» (cursor
 * pagination, ADR-011). Shares `listPublicRides` and the filter chips with
 * `DiscoveryList` (the «Карта» tab) but keeps its own fetch — each tab only
 * pays for the data its own view needs.
 *
 * CR-193 (owner QA): those are the `active` rides only; finished and cancelled
 * ones follow in their own collapsed «Завершённые и отменённые» section
 * (`phase=archive`, same chips, own «Показать ещё»).
 */
export function RideGrid({
  viewSwitch,
  filters: controlledFilters,
  onFiltersChange,
  panelProps,
}: {
  viewSwitch?: ReactNode;
  /** The tab panel's `id`/`role`/`aria-labelledby`, from `DiscoveryTabs`. */
  panelProps?: HTMLAttributes<HTMLDivElement>;
} & DiscoveryFiltersControl = {}) {
  const headingId = useId();
  const [filters, setFilters] = useDiscoveryFilters({
    filters: controlledFilters,
    onFiltersChange,
  });
  const active = usePublicRides(filters, 'active');
  const archive = usePublicRides(filters, 'archive');

  // From the first page only, so «Показать ещё» never swaps the featured card.
  const featured = useMemo(
    () => pickFeaturedRide(active.firstPage),
    [active.firstPage],
  );
  const rest = active.items.filter((ride) => ride.id !== featured?.id);

  function retry() {
    active.retry();
    if (archive.status === 'error') archive.retry();
  }

  let body: ReactNode;
  if (active.status === 'loading') {
    body = <DiscoveryGridSkeleton />;
  } else if (active.status === 'error') {
    body = (
      <ErrorState message={RIDE_DISCOVERY_TERMS.loadError} onRetry={retry} />
    );
  } else if (active.items.length === 0) {
    body = hasActiveFilters(filters) ? (
      <EmptyState
        icon={<ContoursIllustration />}
        title={RIDE_DISCOVERY_TERMS.emptyFilteredTitle}
        description={RIDE_DISCOVERY_TERMS.emptyFilteredDescription}
        action={
          <Button
            variant="secondary"
            onClick={() => setFilters(NO_DISCOVERY_FILTERS)}
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
        action={
          <Link
            href="/organizer/rides/new"
            className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
          >
            {RIDE_DISCOVERY_TERMS.createRideLabel}
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-5 md:gap-7">
        {featured ? <FeaturedRideCard ride={featured} /> : null}

        {rest.length > 0 ? (
          <section
            aria-labelledby={headingId}
            className="mt-2 grid gap-4 md:mt-3 md:gap-5"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 id={headingId} className="text-h2 text-text">
                {RIDE_DISCOVERY_TERMS.allRidesTitle}
              </h2>
              <p className="text-body-sm text-text-muted tabular-nums">
                <span className="md:hidden">{active.total}</span>
                <span className="hidden md:inline">
                  {RIDE_DISCOVERY_TERMS.sortNote}
                </span>
              </p>
            </div>
            <div className={GRID_CLASSNAME}>
              {rest.map((ride) => (
                <RideGridCard key={ride.id} ride={ride} />
              ))}
            </div>
          </section>
        ) : null}

        <ShowMoreRides list={active} buttonClassName="w-full md:w-auto" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-5 px-4 pt-6 pb-10 md:gap-7 md:pt-12 md:pb-16 lg:px-6">
      <div
        data-discovery-head
        className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8"
      >
        <div className="grid gap-3">
          <h1 className="text-h1 text-text">
            {RIDE_DISCOVERY_TERMS.pageTitle}
          </h1>
          <p className="max-w-[62ch] text-body text-text-secondary">
            {RIDE_DISCOVERY_TERMS.pageDescription}
          </p>
        </div>
        {viewSwitch}
      </div>

      <div className="flex items-center gap-4">
        <DiscoveryFilters
          filters={filters}
          onChange={setFilters}
          className="min-w-0 flex-1"
        />
        {/* Always mounted: a live region must exist before its text changes. */}
        <p
          aria-live="polite"
          className="hidden shrink-0 text-body-sm text-text-muted tabular-nums md:block"
        >
          {active.status === 'ready' && active.items.length > 0
            ? RIDE_DISCOVERY_TERMS.ridesCount(active.total)
            : null}
        </p>
      </div>

      <div aria-busy={active.status === 'loading'} {...panelProps}>
        {body}
        <ArchivedRidesSection
          archive={archive}
          hideError={active.status === 'error'}
          className="mt-10 border-t border-border pt-8 md:mt-14 md:pt-10"
        >
          {(rides) => (
            <div className={GRID_CLASSNAME}>
              {rides.map((ride) => (
                <RideGridCard key={ride.id} ride={ride} />
              ))}
            </div>
          )}
        </ArchivedRidesSection>
      </div>
    </div>
  );
}
