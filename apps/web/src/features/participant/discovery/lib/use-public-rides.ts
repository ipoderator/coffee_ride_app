import { useEffect, useRef, useState } from 'react';
import type { PublicRideListItem, RideListPhase } from 'types';
import { type ListPublicRidesParams, listPublicRides } from '../api';
import { type DiscoveryFilters, filtersToQuery } from './discovery-filters';

export type PublicRidesStatus = 'loading' | 'ready' | 'error';

export interface PublicRidesList {
  status: PublicRidesStatus;
  /** Every page loaded so far, in the API's order. */
  items: PublicRideListItem[];
  /** The first page alone: what the featured card is chosen from, so
   * «Показать ещё» never swaps it. */
  firstPage: PublicRideListItem[];
  /** The API's `total` for the chips and this phase. */
  total: number;
  nextCursor: string | null;
  moreStatus: 'idle' | 'loading' | 'error';
  loadMore: () => void;
  retry: () => void;
}

/**
 * One phase of `GET /v1/rides` (CR-193: `active`, or `archive` —
 * finished/cancelled) for the discovery chips, with cursor «Показать ещё»
 * (ADR-011). Both views (`RideGrid`, `DiscoveryList`) read the two phases as
 * two sections, so the scheme they used to repeat inline lives here: every
 * next page reuses the first page's exact query (incl. «Эта неделя»'s
 * computed `startsTo`), and a generation counter drops a late response that
 * belongs to chips the visitor has since changed.
 */
export function usePublicRides(
  filters: DiscoveryFilters,
  phase: RideListPhase,
): PublicRidesList {
  const [status, setStatus] = useState<PublicRidesStatus>('loading');
  const [items, setItems] = useState<PublicRideListItem[]>([]);
  const [firstPage, setFirstPage] = useState<PublicRideListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreStatus, setMoreStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const [attempt, setAttempt] = useState(0);
  const queryRef = useRef<ListPublicRidesParams>({});
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    const query: ListPublicRidesParams = { ...filtersToQuery(filters), phase };
    queryRef.current = query;
    setStatus('loading');
    setMoreStatus('idle');

    listPublicRides(query)
      .then((response) => {
        if (cancelled || generation !== generationRef.current) return;
        setItems(response.items);
        setFirstPage(response.items);
        setTotal(response.total);
        setNextCursor(response.nextCursor);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [filters, phase, attempt]);

  function loadMore() {
    if (!nextCursor || moreStatus === 'loading') return;
    const generation = generationRef.current;
    setMoreStatus('loading');
    listPublicRides({ ...queryRef.current, cursor: nextCursor })
      .then((response) => {
        if (generation !== generationRef.current) return;
        setItems((current) => [...current, ...response.items]);
        setTotal(response.total);
        setNextCursor(response.nextCursor);
        setMoreStatus('idle');
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        setMoreStatus('error');
      });
  }

  return {
    status,
    items,
    firstPage,
    total,
    nextCursor,
    moreStatus,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
