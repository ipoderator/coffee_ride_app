'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RIDE_DISCOVERY_TERMS } from 'ui';
import { DiscoveryList } from './DiscoveryList';
import { RideGrid } from './RideGrid';

type DiscoveryTab = 'grid' | 'map';

function tabClassName(isActive: boolean): string {
  return [
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-body-sm font-semibold md:flex-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive
      ? 'bg-primary-fill text-on-primary-fill'
      : 'text-text-secondary hover:text-text',
  ].join(' ');
}

/**
 * `/` (ADR-024): the "Заезды / Карта" switch between the two discovery
 * views — `RideGrid` (the route-cover card grid) and `DiscoveryList`
 * (ADR-021/CR-118's map-first list, unchanged). Only the active tab is
 * mounted, so switching doesn't pay for the inactive view's data fetch or
 * map render.
 *
 * CR-130: the active tab mirrors `?view=map` in the URL, so the mobile tab
 * bar's «Карта» link (`/?view=map`) opens the map view, and a tab clicked
 * here survives a reload. A click updates local state at once and the URL
 * via `history.replaceState` (Next.js keeps `useSearchParams` in sync with
 * it, no server round trip); a later URL change re-syncs the state.
 */
export function DiscoveryTabs() {
  const searchParams = useSearchParams();
  const urlTab: DiscoveryTab =
    searchParams.get('view') === 'map' ? 'map' : 'grid';
  const [tab, setTab] = useState<DiscoveryTab>(urlTab);

  useEffect(() => {
    setTab(urlTab);
  }, [urlTab]);

  function selectTab(next: DiscoveryTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'map') url.searchParams.set('view', 'map');
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', url);
  }

  // CR-152: the switch sits in each view's own header row, beside its `h1`,
  // rather than centred on a row of its own above it. CR-153 (owner's
  // mockup): «Список / Карта» with icons, full width on a phone.
  const viewSwitch = (
    <div
      role="tablist"
      aria-label={RIDE_DISCOVERY_TERMS.tabsLabel}
      className="flex w-full shrink-0 gap-1 rounded-full border border-border bg-surface p-1 md:w-fit"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'grid'}
        className={tabClassName(tab === 'grid')}
        onClick={() => selectTab('grid')}
      >
        <List aria-hidden="true" className="size-5" />
        {RIDE_DISCOVERY_TERMS.viewGridLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'map'}
        className={tabClassName(tab === 'map')}
        onClick={() => selectTab('map')}
      >
        <MapIcon aria-hidden="true" className="size-5" />
        {RIDE_DISCOVERY_TERMS.viewMapLabel}
      </button>
    </div>
  );

  return tab === 'grid' ? (
    <RideGrid viewSwitch={viewSwitch} />
  ) : (
    <DiscoveryList viewSwitch={viewSwitch} />
  );
}
