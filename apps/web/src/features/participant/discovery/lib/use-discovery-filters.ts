import { useState } from 'react';
import {
  NO_DISCOVERY_FILTERS,
  type DiscoveryFilters,
} from './discovery-filters';

/** A view's chip state: the parent's (`DiscoveryTabs`) when given, else its own. */
export interface DiscoveryFiltersControl {
  filters?: DiscoveryFilters;
  onFiltersChange?: (filters: DiscoveryFilters) => void;
}

/**
 * `RideGrid` and `DiscoveryList` are unmounted when the other tab is active, so
 * state held inside them is lost on every switch. `DiscoveryTabs` owns the
 * chips and passes them down; rendered alone (tests, stories) a view still
 * works with its own state.
 */
export function useDiscoveryFilters({
  filters,
  onFiltersChange,
}: DiscoveryFiltersControl): [
  DiscoveryFilters,
  (filters: DiscoveryFilters) => void,
] {
  const [own, setOwn] = useState(NO_DISCOVERY_FILTERS);
  return [filters ?? own, onFiltersChange ?? setOwn];
}
