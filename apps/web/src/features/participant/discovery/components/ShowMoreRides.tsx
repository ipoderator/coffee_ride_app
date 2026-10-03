import { Button, RIDE_DISCOVERY_TERMS, cn } from 'ui';
import type { PublicRidesList } from '../lib/use-public-rides';

/**
 * «Показать ещё N заездов» under a discovery list (CR-153; shared by both views
 * and both sections since CR-193): the next cursor page of the same query. A
 * failure keeps the loaded rides and shows an inline alert over the button.
 * Nothing when there is no next page.
 */
export function ShowMoreRides({
  list,
  className,
  buttonClassName,
}: {
  list: PublicRidesList;
  className?: string;
  buttonClassName?: string;
}) {
  if (!list.nextCursor) return null;
  const remaining = Math.max(0, list.total - list.items.length);
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {list.moreStatus === 'error' ? (
        <p role="alert" className="text-body-sm text-danger">
          {RIDE_DISCOVERY_TERMS.loadMoreError}
        </p>
      ) : null}
      <Button
        variant="secondary"
        isLoading={list.moreStatus === 'loading'}
        onClick={list.loadMore}
        className={buttonClassName}
      >
        {remaining > 0
          ? RIDE_DISCOVERY_TERMS.showMore(remaining)
          : RIDE_DISCOVERY_TERMS.showMoreFallback}
      </Button>
    </div>
  );
}
