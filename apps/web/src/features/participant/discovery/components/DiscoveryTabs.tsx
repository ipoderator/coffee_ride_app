'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { RIDE_DISCOVERY_TERMS } from 'ui';
import {
  applyFiltersToSearchParams,
  filtersFromSearchParams,
  type DiscoveryFilters,
} from '../lib/discovery-filters';
import { DiscoveryList } from './DiscoveryList';
import { RideGrid } from './RideGrid';

type DiscoveryTab = 'grid' | 'map';

const TABS: DiscoveryTab[] = ['grid', 'map'];
const tabId = (tab: DiscoveryTab) => `discovery-tab-${tab}`;
const PANEL_ID = 'discovery-tabpanel';

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

  // The chips live here, above both views (only the active one is mounted), and
  // mirror into the URL like `view` does — a choice survives the tab switch, a
  // reload and a shared link. Read once at mount; later writes are ours.
  const [filters, setFilters] = useState<DiscoveryFilters>(() =>
    filtersFromSearchParams(searchParams),
  );

  function changeFilters(next: DiscoveryFilters) {
    setFilters(next);
    const url = new URL(window.location.href);
    applyFiltersToSearchParams(url.searchParams, next);
    window.history.replaceState(window.history.state, '', url);
  }

  // The switch is rendered inside whichever view is mounted, so it is
  // destroyed and recreated on every change — a keyboard user's focus would
  // fall to <body>. Remember that the change came from the keyboard and put
  // focus back on the new tab once the new view is in place.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    document.getElementById(tabId(tab))?.focus();
  }, [tab]);

  // WAI-ARIA tabs, automatic activation: arrows move between tabs and select
  // (wrapping), Home/End jump to the ends; only the selected tab is in the
  // Tab order (roving tabindex).
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.indexOf(tab);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % TABS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    restoreFocus.current = true;
    selectTab(TABS[nextIndex]!);
  }

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
        id={tabId('grid')}
        aria-selected={tab === 'grid'}
        aria-controls={tab === 'grid' ? PANEL_ID : undefined}
        tabIndex={tab === 'grid' ? 0 : -1}
        onKeyDown={onTabKeyDown}
        className={tabClassName(tab === 'grid')}
        onClick={() => selectTab('grid')}
      >
        <List aria-hidden="true" className="size-5" />
        {RIDE_DISCOVERY_TERMS.viewGridLabel}
      </button>
      <button
        type="button"
        role="tab"
        id={tabId('map')}
        aria-selected={tab === 'map'}
        aria-controls={tab === 'map' ? PANEL_ID : undefined}
        tabIndex={tab === 'map' ? 0 : -1}
        onKeyDown={onTabKeyDown}
        className={tabClassName(tab === 'map')}
        onClick={() => selectTab('map')}
      >
        <MapIcon aria-hidden="true" className="size-5" />
        {RIDE_DISCOVERY_TERMS.viewMapLabel}
      </button>
    </div>
  );

  // The results region of the active view is the tab's panel (the switch itself
  // sits in the view's header, outside it).
  const panelProps: HTMLAttributes<HTMLDivElement> = {
    id: PANEL_ID,
    role: 'tabpanel',
    'aria-labelledby': tabId(tab),
  };

  return tab === 'grid' ? (
    <RideGrid
      viewSwitch={viewSwitch}
      filters={filters}
      onFiltersChange={changeFilters}
      panelProps={panelProps}
    />
  ) : (
    <DiscoveryList
      viewSwitch={viewSwitch}
      filters={filters}
      onFiltersChange={changeFilters}
      panelProps={panelProps}
    />
  );
}
