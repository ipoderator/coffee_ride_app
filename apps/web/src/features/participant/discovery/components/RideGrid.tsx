'use client';

import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import type { PublicRideListItem } from 'types';
import {
  Button,
  ContoursIllustration,
  EmptyState,
  ErrorState,
  RIDE_DISCOVERY_TERMS,
} from 'ui';
import { type ListPublicRidesParams, listPublicRides } from '../api';
import {
  NO_DISCOVERY_FILTERS,
  filtersToQuery,
  hasActiveFilters,
} from '../lib/discovery-filters';
import {
  useDiscoveryFilters,
  type DiscoveryFiltersControl,
} from '../lib/use-discovery-filters';
import { pickFeaturedRide } from '../lib/ride-metrics';
import { DiscoveryFilters } from './DiscoveryFilters';
import { DiscoveryGridSkeleton } from './DiscoveryPageSkeleton';
import { FeaturedRideCard } from './FeaturedRideCard';
import { RideGridCard } from './RideGridCard';

type LoadStatus = 'loading' | 'ready' | 'error';

const GRID_CLASSNAME =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5';

/**
 * ADR-024's «Список» tab, laid out to the owner's mockup in CR-153: page
 * intro, filter chips with the total, the featured «Ближайший» card, then
 * «Все заезды» as compact cards and «Показать ещё N заездов» (cursor
 * pagination, ADR-011). Shares `listPublicRides` and the filter chips with
 * `DiscoveryList` (the «Карта» tab) but keeps its own fetch — each tab only
 * pays for the data its own view needs.
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
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRideListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [filters, setFilters] = useDiscoveryFilters({
    filters: controlledFilters,
    onFiltersChange,
  });
  const [attempt, setAttempt] = useState(0);
  const [moreStatus, setMoreStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  // The first page's exact query (incl. «Эта неделя»'s computed `startsTo`),
  // so every «Показать ещё» page continues the same list; bumped per new
  // first-page load so a late next-page response for old filters is dropped.
  const queryRef = useRef<ListPublicRidesParams>({});
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    const query = filtersToQuery(filters);
    queryRef.current = query;
    setStatus('loading');
    setMoreStatus('idle');

    listPublicRides(query)
      .then((response) => {
        if (cancelled || generation !== generationRef.current) return;
        setRides(response.items);
        setTotal(response.total);
        setNextCursor(response.nextCursor);
        setFeaturedId(pickFeaturedRide(response.items)?.id ?? null);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [filters, attempt]);

  function loadMore() {
    if (!nextCursor || moreStatus === 'loading') return;
    const generation = generationRef.current;
    setMoreStatus('loading');
    listPublicRides({ ...queryRef.current, cursor: nextCursor })
      .then((response) => {
        if (generation !== generationRef.current) return;
        setRides((current) => [...current, ...response.items]);
        setTotal(response.total);
        setNextCursor(response.nextCursor);
        setMoreStatus('idle');
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        setMoreStatus('error');
      });
  }

  const featured = rides.find((ride) => ride.id === featuredId) ?? null;
  const rest = rides.filter((ride) => ride.id !== featuredId);
  const remaining = Math.max(0, total - rides.length);

  let body: ReactNode;
  if (status === 'loading') {
    body = <DiscoveryGridSkeleton />;
  } else if (status === 'error') {
    body = (
      <ErrorState
        message={RIDE_DISCOVERY_TERMS.loadError}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  } else if (rides.length === 0) {
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
                <span className="md:hidden">{total}</span>
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

        {nextCursor ? (
          <div className="flex flex-col items-center gap-3">
            {moreStatus === 'error' ? (
              <p role="alert" className="text-body-sm text-danger">
                {RIDE_DISCOVERY_TERMS.loadMoreError}
              </p>
            ) : null}
            <Button
              variant="secondary"
              isLoading={moreStatus === 'loading'}
              onClick={loadMore}
              className="w-full md:w-auto"
            >
              {remaining > 0
                ? RIDE_DISCOVERY_TERMS.showMore(remaining)
                : RIDE_DISCOVERY_TERMS.showMoreFallback}
            </Button>
          </div>
        ) : null}
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
          {status === 'ready' && rides.length > 0
            ? RIDE_DISCOVERY_TERMS.ridesCount(total)
            : null}
        </p>
      </div>

      <div aria-busy={status === 'loading'} {...panelProps}>
        {body}
      </div>
    </div>
  );
}
