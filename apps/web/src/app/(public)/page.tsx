import { DiscoveryTabs } from '@/features/participant/discovery/components/DiscoveryTabs';

// `/` (CR-024, `docs/design.md` §8 "Discovery"). ADR-024 («Ночной старт»):
// `DiscoveryTabs` owns the whole layout — the "Заезды / Карта" switch plus
// whichever of `RideGrid`/`DiscoveryList` is active — and this route only
// provides the landmark.
export default function Home() {
  return (
    <main>
      <DiscoveryTabs />
    </main>
  );
}
