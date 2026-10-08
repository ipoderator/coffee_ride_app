import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DiscoveryPageSkeleton } from '@/features/participant/discovery/components/DiscoveryPageSkeleton';
import { DiscoveryTabs } from '@/features/participant/discovery/components/DiscoveryTabs';

// `/` (CR-024, `docs/design.md` §8 "Discovery"). ADR-024 («Ночной старт»):
// `DiscoveryTabs` owns the whole layout — the "Заезды / Карта" switch plus
// whichever of `RideGrid`/`DiscoveryList` is active — and this route only
// provides the landmark. CR-130: `DiscoveryTabs` reads `?view=` via
// `useSearchParams`, which needs a Suspense boundary on this statically
// rendered route. The fallback is the prerendered HTML a visitor sees first:
// the real page title plus skeletons for the data-dependent parts (the views
// fetch their rides client-side), so the first paint has content and shape.
// QA live audit 2026-10-08, item 7: `?view=`/filter variants are the same page.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function Home() {
  return (
    <main>
      <Suspense fallback={<DiscoveryPageSkeleton />}>
        <DiscoveryTabs />
      </Suspense>
    </main>
  );
}
