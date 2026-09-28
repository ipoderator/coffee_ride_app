'use client';

import { type RefObject, useEffect, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * CR-151: an element's rendered size, kept current by a `ResizeObserver` —
 * the cover and the elevation profile draw in real pixels (round pins, crisp
 * axis labels) instead of a stretched `viewBox`. `fallback` is the size until
 * the first measurement, and for good where there is no `ResizeObserver`
 * (jsdom in tests, very old browsers).
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  fallback: ElementSize,
): ElementSize {
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 2 && height > 2) {
        setSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
