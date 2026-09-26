import { Suspense } from 'react';
import { DiscoveryTabs } from '@/features/participant/discovery/components/DiscoveryTabs';

// `/` (CR-024, `docs/design.md` §8 "Discovery"). ADR-024 («Ночной старт»):
// `DiscoveryTabs` owns the whole layout — the "Заезды / Карта" switch plus
// whichever of `RideGrid`/`DiscoveryList` is active — and this route only
// provides the landmark. CR-130: `DiscoveryTabs` reads `?view=` via
// `useSearchParams`, which needs a Suspense boundary on this statically
// rendered route. The fallback is empty: both views fetch their rides
// client-side anyway, so the prerendered HTML loses no content.
export default function Home() {
  return (
    <main>
      <Suspense fallback={null}>
        <DiscoveryTabs />
      </Suspense>
    </main>
  );
}
