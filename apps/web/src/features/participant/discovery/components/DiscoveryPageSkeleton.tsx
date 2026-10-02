import { RIDE_DISCOVERY_TERMS, Skeleton } from 'ui';

const GRID_CLASSNAME =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5';

/** The «Список» tab's loading cards: the featured card, then three compact ones. */
export function DiscoveryGridSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-5 md:gap-7">
      <Skeleton className="h-150 rounded-3xl md:h-95" />
      <div className={GRID_CLASSNAME}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-108 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * `/`'s Suspense fallback (`app/(public)/page.tsx`): what the prerendered HTML
 * shows until `DiscoveryTabs` hydrates and `RideGrid` fetches. The page title and
 * description are static, so they are real text (first paint, no layout jump);
 * only what depends on data or client state — the view switch, the filter chips,
 * the cards — is a skeleton, laid out like `RideGrid`'s own header and loading
 * state (`docs/design.md` §10: skeletons match the final layout).
 */
export function DiscoveryPageSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-300 flex-col gap-5 px-4 pt-6 pb-10 md:gap-7 md:pt-12 md:pb-16 lg:px-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="grid gap-3">
          <h1 className="text-h1 text-text">
            {RIDE_DISCOVERY_TERMS.pageTitle}
          </h1>
          <p className="max-w-[62ch] text-body text-text-secondary">
            {RIDE_DISCOVERY_TERMS.pageDescription}
          </p>
        </div>
        <Skeleton className="h-13.5 w-full rounded-full md:w-56" />
      </div>
      <div aria-hidden="true" className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <DiscoveryGridSkeleton />
    </div>
  );
}
