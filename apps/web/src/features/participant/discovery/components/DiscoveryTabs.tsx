'use client';

import { useState } from 'react';
import { RIDE_DISCOVERY_TERMS } from 'ui';
import { DiscoveryList } from './DiscoveryList';
import { RideGrid } from './RideGrid';

type DiscoveryTab = 'grid' | 'map';

function tabClassName(isActive: boolean): string {
  return [
    'min-h-11 rounded-full px-5 text-sm font-medium',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive
      ? 'bg-primary-fill text-on-primary-fill'
      : 'bg-bg-raised text-text-secondary hover:text-text',
  ].join(' ');
}

/**
 * `/` (ADR-024): the "Заезды / Карта" switch between the two discovery
 * views — `RideGrid` (the route-cover card grid) and `DiscoveryList`
 * (ADR-021/CR-118's map-first list, unchanged). Only the active tab is
 * mounted, so switching doesn't pay for the inactive view's data fetch or
 * map render.
 */
export function DiscoveryTabs() {
  const [tab, setTab] = useState<DiscoveryTab>('grid');

  return (
    <div>
      <div
        role="tablist"
        aria-label={RIDE_DISCOVERY_TERMS.tabsLabel}
        className="mx-auto flex w-fit gap-1 rounded-full bg-surface p-1 mt-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'grid'}
          className={tabClassName(tab === 'grid')}
          onClick={() => setTab('grid')}
        >
          {RIDE_DISCOVERY_TERMS.viewGridLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'map'}
          className={tabClassName(tab === 'map')}
          onClick={() => setTab('map')}
        >
          {RIDE_DISCOVERY_TERMS.viewMapLabel}
        </button>
      </div>
      {tab === 'grid' ? <RideGrid /> : <DiscoveryList />}
    </div>
  );
}
