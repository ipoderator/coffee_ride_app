'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from 'types';

// CR-231: one paginated admin list — first page on mount and whenever `key`
// (the serialized filters) changes, «Показать ещё» appends the next page, and
// `replace` swaps one row in place after a mutation answered with its new state.
// A response that lost the race to a newer filter is dropped, never rendered.

export type AdminListState<Item> =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      items: Item[];
      nextCursor: string | null;
      isLoadingMore: boolean;
      loadMoreFailed: boolean;
    };

export function useAdminList<Item extends { id: string }>(
  key: string,
  fetchPage: (cursor?: string) => Promise<Paginated<Item>>,
) {
  const [state, setState] = useState<AdminListState<Item>>({
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);

  // A new filter (or a retry) shows the skeleton in the same render that
  // asks for it — React's "adjust state on a prop change", not a set in the
  // effect below.
  const request = `${attempt}:${key}`;
  const [shownRequest, setShownRequest] = useState(request);
  if (request !== shownRequest) {
    setShownRequest(request);
    setState({ status: 'loading' });
  }

  // Declared before the fetch effect, so it runs first in the same commit.
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  useEffect(() => {
    const current = ++generation.current;
    fetchRef
      .current()
      .then((page) => {
        if (generation.current !== current) return;
        setState({
          status: 'ready',
          items: page.items,
          nextCursor: page.nextCursor,
          isLoadingMore: false,
          loadMoreFailed: false,
        });
      })
      .catch(() => {
        if (generation.current === current) setState({ status: 'error' });
      });
  }, [key, attempt]);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || !state.nextCursor || state.isLoadingMore) {
      return;
    }
    const current = generation.current;
    const cursor = state.nextCursor;
    setState({ ...state, isLoadingMore: true, loadMoreFailed: false });
    fetchRef
      .current(cursor)
      .then((page) => {
        if (generation.current !== current) return;
        setState((previous) =>
          previous.status === 'ready'
            ? {
                ...previous,
                items: [...previous.items, ...page.items],
                nextCursor: page.nextCursor,
                isLoadingMore: false,
              }
            : previous,
        );
      })
      .catch(() => {
        if (generation.current !== current) return;
        setState((previous) =>
          previous.status === 'ready'
            ? { ...previous, isLoadingMore: false, loadMoreFailed: true }
            : previous,
        );
      });
  }, [state]);

  const replace = useCallback((item: Item) => {
    setState((previous) =>
      previous.status === 'ready'
        ? {
            ...previous,
            items: previous.items.map((existing) =>
              existing.id === item.id ? item : existing,
            ),
          }
        : previous,
    );
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, loadMore, replace, retry };
}
