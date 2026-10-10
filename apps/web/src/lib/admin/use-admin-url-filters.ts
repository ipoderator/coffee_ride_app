'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { adminFiltersQuery, type AdminUrlFilters } from './url-filters';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

// CR-232: the client half of `url-filters.ts` — see the rationale there.

/** The list's filters read from the URL, and a setter that pushes a history
 * entry for a real change (a repeat of the current filters pushes nothing). */
export function useAdminUrlFilters<F extends AdminUrlFilters>(
  parse: (params: SearchParamsLike) => F,
  defaults: F,
): [F, (patch: Partial<F>) => void] {
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  // `serialized` is the dependency, not the params object — a navigation that
  // keeps the same query must not look like a filter change.
  const filters = useMemo(
    () => parse(new URLSearchParams(serialized)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `parse` is a module-level function
    [serialized],
  );

  function setFilters(patch: Partial<F>) {
    const next = { ...filters, ...patch };
    const query = adminFiltersQuery(next, defaults);
    if (query === adminFiltersQuery(filters, defaults)) return;
    window.history.pushState(null, '', `${window.location.pathname}${query}`);
  }

  return [filters, setFilters];
}
