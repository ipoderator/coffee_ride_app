import { DiscoveryList } from '@/features/participant/discovery/components/DiscoveryList';

// `/` (CR-024, `docs/design.md` §8 "Discovery"). CR-118 («Топокарта»): the map
// is the page, so `DiscoveryList` owns the whole layout — the map, the list
// column and its `h1` — and this route only provides the landmark.
export default function Home() {
  return (
    <main>
      <DiscoveryList />
    </main>
  );
}
