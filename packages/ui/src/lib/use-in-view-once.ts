'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * CR-170: `true` from the first time the element is at least `threshold`
 * visible, and from then on. Starts a once-only micro-animation (a route track
 * drawing in, difficulty segments filling) when the viewer can actually see
 * it, instead of on mount below the fold. Pair it with a paused
 * `animation-play-state` until it flips.
 *
 * Without `IntersectionObserver` (jsdom, an old browser) it reports visible at
 * once — the content must never stay in its pre-animation state. `enabled:
 * false` skips observing entirely and always reports `false`.
 */
export function useInViewOnce(
  ref: RefObject<Element | null>,
  {
    enabled = true,
    threshold = 0.35,
  }: { enabled?: boolean; threshold?: number } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || inView) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled, inView, threshold]);

  return enabled && inView;
}
