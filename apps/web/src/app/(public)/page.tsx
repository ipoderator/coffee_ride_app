import { RIDE_DISCOVERY_TERMS } from 'ui';
import { DiscoveryList } from '@/features/participant/discovery/components/DiscoveryList';

// `/` (CR-024, `docs/design.md` §8 "Discovery"): replaces the CR-002 bootstrap
// placeholder. List-only slice — no map toggle (CR-026) or filters (CR-025) yet.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_DISCOVERY_TERMS.pageTitle}
      </h1>
      <DiscoveryList />
    </main>
  );
}
