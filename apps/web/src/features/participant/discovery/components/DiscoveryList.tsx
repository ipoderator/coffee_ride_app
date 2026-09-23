'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import type { BicycleType, PublicRideListItem } from 'types';
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  RIDE_DISCOVERY_ROW_TERMS,
  RIDE_DISCOVERY_TERMS,
  Skeleton,
} from 'ui';
import { listPublicRides } from '../api';
import { ContoursIllustration } from './ContoursIllustration';
import { DiscoveryMap } from './DiscoveryMap';
import { RideFilters } from './RideFilters';
import { RideLegendRow } from './RideLegendRow';

type LoadStatus = 'loading' | 'ready' | 'error';

// `lg` in Tailwind's default scale — the split-view breakpoint (§11).
const DESKTOP_QUERY = '(min-width: 1024px)';

function isDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DESKTOP_QUERY).matches
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// `useLayoutEffect` warns during SSR; this component also renders on the server.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

function LoadingRows() {
  return (
    <ul aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <li
          key={index}
          className="flex gap-3 border-b border-border px-4 py-4 lg:px-6"
        >
          <Skeleton className="mt-1 ml-1 size-8 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-48" />
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * `/` (CR-024 → CR-118, ADR-021 «Топокарта»): the map is the page, the list is
 * the sheet's margin. `GET /v1/rides` is public — no session cookie is sent.
 *
 * Layout (`docs/design.md` §11):
 * - `lg`+: the map fills the left side at viewport height (minus the header),
 *   the ~440px right column holds the heading, the bicycle-type filter
 *   (CR-025) and the legend rows, and scrolls on its own. At `xl` the grid
 *   breaks out of the 1200px content cap so the map runs to the viewport edge
 *   while the column stays aligned with the header's content edge.
 * - below `lg`: a map strip on top (~45vh) and the list below it as the page's
 *   main scroll. Both are always shown — CR-026's «Список / Карта» toggle was
 *   retired because the strip already gives the map without hiding the list.
 *
 * Map ↔ list sync: the active ride is the hovered row, else the selected one.
 * Selection comes from focusing a row's link (keyboard — never hover-only) or
 * clicking a pin; a pin click scrolls the row into view on desktop and raises
 * a copy of it over the map strip on a phone, where scrolling the list would
 * push the map off-screen.
 */
export function DiscoveryList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rides, setRides] = useState<PublicRideListItem[]>([]);
  const [bicycleType, setBicycleType] = useState<BicycleType | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [raisedId, setRaisedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const rootRef = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    listPublicRides({ bicycleType })
      .then((response) => {
        if (cancelled) return;
        setRides(response.items);
        // A row that was hovered may be gone after a filter change, and its
        // `mouseleave` will never fire — don't let it pin the map's highlight.
        setHoveredId(null);
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

  // The desktop grid is "viewport height minus whatever sits above it" (the
  // global header). Measured rather than hard-coded so a header change can't
  // silently leave a gap or a page scrollbar.
  useIsomorphicLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      setTopOffset(root.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const activeId = hoveredId ?? selectedId;

  const handlePinSelect = useCallback((rideId: string) => {
    setSelectedId(rideId);
    if (isDesktop()) {
      setRaisedId(null);
      rowRefs.current.get(rideId)?.scrollIntoView?.({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    } else {
      setRaisedId(rideId);
    }
  }, []);

  const raisedRide = rides.find((ride) => ride.id === raisedId) ?? null;

  let listPanel: ReactNode;
  if (status === 'loading') {
    listPanel = <LoadingRows />;
  } else if (status === 'error') {
    listPanel = (
      <div className="px-4 py-6 lg:px-6">
        <ErrorState
          message={RIDE_DISCOVERY_TERMS.loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  } else if (rides.length === 0) {
    listPanel = bicycleType ? (
      <EmptyState
        icon={<ContoursIllustration />}
        title={RIDE_DISCOVERY_TERMS.emptyFilteredTitle}
        action={
          <Button variant="secondary" onClick={() => setBicycleType(undefined)}>
            {RIDE_DISCOVERY_TERMS.resetFiltersLabel}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<ContoursIllustration />}
        title={RIDE_DISCOVERY_ROW_TERMS.emptyTitle}
        description={RIDE_DISCOVERY_TERMS.emptyDescription}
      />
    );
  } else {
    listPanel = (
      <ul aria-label={RIDE_DISCOVERY_ROW_TERMS.listLabel}>
        {rides.map((ride) => (
          <RideLegendRow
            key={ride.id}
            ride={ride}
            active={ride.id === activeId}
            onHoverChange={setHoveredId}
            onFocus={setSelectedId}
            rowRef={(element) => {
              if (element) rowRefs.current.set(ride.id, element);
              else rowRefs.current.delete(ride.id);
            }}
            className="lg:scroll-mt-32"
          />
        ))}
      </ul>
    );
  }

  const rootStyle =
    topOffset === null
      ? undefined
      : ({ '--discovery-top': `${topOffset}px` } as CSSProperties);

  return (
    <div
      ref={rootRef}
      style={rootStyle}
      className="flex flex-col lg:grid lg:h-[calc(100dvh-var(--discovery-top,4.875rem))] lg:grid-cols-[minmax(0,1fr)_27.5rem] xl:mx-[calc(50%-50vw)] xl:pr-[calc(50vw-37.5rem)]"
    >
      <section
        aria-labelledby="discovery-heading"
        data-testid="discovery-list-panel"
        className="flex min-h-0 flex-col lg:col-start-2 lg:row-start-1 lg:overflow-y-auto lg:border-l-[1.5px] lg:border-frame"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-[1.5px] border-frame bg-bg px-4 pt-6 pb-4 lg:sticky lg:top-0 lg:z-10 lg:px-6">
          <h1
            id="discovery-heading"
            className="text-4xl leading-none font-semibold text-text"
          >
            {RIDE_DISCOVERY_TERMS.pageTitle}
          </h1>
          <RideFilters bicycleType={bicycleType} onChange={setBicycleType} />
        </div>
        <div aria-busy={status === 'loading'}>{listPanel}</div>
      </section>

      <div
        data-testid="discovery-map-panel"
        className={cn(
          'relative order-first h-[45vh] min-h-64 border-b-[1.5px] border-frame lg:order-0 lg:col-start-1 lg:row-start-1 lg:h-auto lg:min-h-0 lg:border-b-0',
          // Degraded (no key / render failed): the strip shrinks to the notice
          // instead of leaving a tall blank band above the list.
          'has-[[data-map-unavailable]]:h-auto has-[[data-map-unavailable]]:min-h-0',
        )}
      >
        <DiscoveryMap
          rides={rides}
          activeId={activeId}
          onSelect={handlePinSelect}
        />
        {raisedRide ? (
          // `bottom-8` keeps the provider's attribution in the corner visible.
          <div className="absolute inset-x-2 bottom-8 z-10 overflow-hidden rounded-xl border border-frame bg-bg shadow-overlay lg:hidden">
            <ul aria-label={RIDE_DISCOVERY_ROW_TERMS.listLabel}>
              <RideLegendRow
                ride={raisedRide}
                active
                compact
                className="rounded-xl border-b-0 py-3 pr-12"
              />
            </ul>
            <button
              type="button"
              aria-label={RIDE_DISCOVERY_ROW_TERMS.closeSelected}
              onClick={() => setRaisedId(null)}
              className="absolute top-1 right-1 z-10 flex size-11 items-center justify-center rounded-md text-text-secondary hover:text-text"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
