'use client';

import type { ReactNode } from 'react';
import { ADMIN_TERMS, Button, EmptyState, ErrorState, Skeleton } from 'ui';
import type { AdminListState } from '@/lib/admin/use-admin-list';

/**
 * CR-231: the states every paginated admin list shares — loading, failed
 * (with a retry), empty, and the rows followed by «Показать ещё» while the
 * API reports a next page. The rows themselves are the caller's.
 */
export function AdminListBody<Item>({
  state,
  onRetry,
  onLoadMore,
  emptyTitle,
  emptyDescription,
  children,
}: {
  state: AdminListState<Item>;
  onRetry: () => void;
  onLoadMore: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  children: (items: Item[]) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        message={ADMIN_TERMS.loadError}
        onRetry={onRetry}
        retryLabel={ADMIN_TERMS.retry}
      />
    );
  }

  if (state.items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {children(state.items)}
      {state.loadMoreFailed ? (
        <p role="alert" className="text-body-sm text-danger">
          {ADMIN_TERMS.loadMoreError}
        </p>
      ) : null}
      {state.nextCursor ? (
        <Button
          variant="secondary"
          className="self-center"
          isLoading={state.isLoadingMore}
          onClick={onLoadMore}
        >
          {ADMIN_TERMS.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
