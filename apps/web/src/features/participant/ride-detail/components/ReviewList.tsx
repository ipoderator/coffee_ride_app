import type { Review } from 'types';
import {
  EmptyState,
  ErrorState,
  REVIEWS_TERMS,
  Skeleton,
  formatDate,
} from 'ui';

export type ReviewListStatus = 'loading' | 'ready' | 'error';

/**
 * `/rides/[id]`'s "Отзывы" list (CR-042, `docs/design.md` §9 — feature-local, same
 * "purely presentational, list already fetched by the parent" precedent as
 * `StopList`). Read-only — no edit/delete (`.claude/context/current-task.md`).
 */
export function ReviewList({
  status,
  reviews,
  onRetry,
}: {
  status: ReviewListStatus;
  reviews: Review[];
  onRetry: () => void;
}) {
  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={REVIEWS_TERMS.loadError} onRetry={onRetry} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        title={REVIEWS_TERMS.emptyTitle}
        description={REVIEWS_TERMS.emptyDescription}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="flex flex-col gap-1 border-b border-border pb-3 last:border-none last:pb-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text">
              {review.authorName ?? '—'}
            </span>
            <span
              aria-label={`${review.rating} из 5`}
              className="text-sm font-semibold text-text tabular-nums"
            >
              {review.rating}/5
            </span>
          </div>
          {review.comment && (
            <p className="text-sm text-text-secondary">{review.comment}</p>
          )}
          <p className="text-xs text-text-secondary">
            {formatDate(new Date(review.createdAt))}
          </p>
        </li>
      ))}
    </ul>
  );
}
