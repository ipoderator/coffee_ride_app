import { useMemo, useSyncExternalStore } from 'react';

// CR-232: `next/navigation`'s `useSearchParams`/`usePathname` for jsdom tests,
// backed by the real `window.location`. Next's router mirrors native
// `history.pushState` and back/forward into these hooks; here `pushState`/
// `replaceState` announce themselves and `popstate` (jsdom fires it on
// `history.back()`) re-reads the URL, so a test can drive a list through its
// URL exactly as the browser would. Use with
// `vi.mock('next/navigation', () => import('@/test-support/next-navigation'))`.

const LOCATION_CHANGE = 'test:locationchange';

for (const method of ['pushState', 'replaceState'] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args: Parameters<History['pushState']>) => {
    original(...args);
    window.dispatchEvent(new Event(LOCATION_CHANGE));
  };
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(LOCATION_CHANGE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(LOCATION_CHANGE, onChange);
  };
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** Puts the test on `url` without a history entry. */
export function setTestUrl(url: string) {
  window.history.replaceState(null, '', url);
}
