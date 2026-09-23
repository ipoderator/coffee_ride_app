'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, MapHandle } from 'maps-core';
import type { PublicRideListItem } from 'types';
import { RIDE_DISCOVERY_ROW_TERMS, cn, formatTime } from 'ui';
import { createMapRenderer } from '@/lib/maps/create-map-renderer';
import { getCssColorVar } from '@/lib/maps/css-color';
import { RideMapPlaceholder } from './RideMapPlaceholder';

// A ride with no start location can't get a pin — same "missing data" stance
// the rest of the app takes (`docs/design.md` §6/§7: absent, never a fake 0).
type PlottableRide = PublicRideListItem & {
  startLat: number;
  startLng: number;
};

function isPlottable(ride: PublicRideListItem): ride is PlottableRide {
  return ride.startLat !== null && ride.startLng !== null;
}

// Moscow — a reasonable default center when no ride has a start location yet
// (an empty/loading result, or every ride missing coordinates). Not a design
// decision about the platform's home city, just a non-empty fallback so the
// map has somewhere to point before any pin exists.
const DEFAULT_CENTER = { lat: 55.7558, lng: 37.6173 };
const FIT_OPTIONS = { padding: 64, maxZoom: 12 };

/**
 * Bumps whenever the theme class on `<html>` changes (CR-110's theme control),
 * so map colours — resolved from CSS custom properties at call time, since the
 * map draws outside Tailwind's reach (`docs/design.md` §14) — are re-applied
 * in the new theme instead of keeping the old one until the next data change.
 */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setVersion((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return version;
}

/**
 * `/`'s map (CR-098/ADR-020, rebuilt for «Топокарта» by CR-118). Falls back to
 * `RideMapPlaceholder` (`docs/design.md` §10's degraded state) whenever no key
 * is configured or the render fails — the list next to it stays fully usable.
 *
 * CR-118 fixes the "markers never follow the filter" bug: the map is created
 * once, and separate effects keep it in sync with the data —
 * - start pins (orienteering rings captioned with the ride's local start
 *   time) follow `rides` and `activeId`;
 * - the camera re-frames every start point only when the set of plottable
 *   rides changes, never on a hover;
 * - the active ride's `routePreview` is drawn as the route line.
 * A pin click reports the ride id (`onSelect`); the list decides what that
 * means (scroll the row into view, or raise it on a phone).
 */
export function DiscoveryMap({
  rides,
  activeId,
  onSelect,
  className,
}: {
  rides: PublicRideListItem[];
  activeId: string | null;
  onSelect: (rideId: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const themeVersion = useThemeVersion();

  // The render options are fixed at map creation; route the click through a
  // ref so it always calls the parent's current handler.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const plottable = useMemo(() => rides.filter(isPlottable), [rides]);
  // A stable identity for "which pins exist where" — the fit effect keys on
  // this, not on the `rides` array (a refetch returns a new array even when
  // nothing moved).
  const plottableKey = plottable
    .map((ride) => `${ride.id}@${ride.startLat},${ride.startLng}`)
    .join('|');

  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) {
      setRenderFailed(!renderer);
      return;
    }

    let cancelled = false;
    let rendered: MapHandle | undefined;

    renderer
      .render({
        container: containerRef.current,
        center: DEFAULT_CENTER,
        zoom: 9,
        onMarkerClick: (id) => onSelectRef.current(id),
      })
      .then((renderedHandle) => {
        if (cancelled) {
          renderedHandle.destroy();
          return;
        }
        rendered = renderedHandle;
        setHandle(renderedHandle);
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });

    return () => {
      cancelled = true;
      rendered?.destroy();
      setHandle(null);
    };
  }, []);

  // Pins: rebuilt whenever the rides, the active ride or the theme change.
  useEffect(() => {
    if (!handle) return;
    const route = getCssColorVar('--route');
    const primary = getCssColorVar('--primary');
    const halo = getCssColorVar('--route-casing');
    handle.setMarkers(
      plottable.map((ride) => {
        const selected = ride.id === activeId;
        return {
          id: ride.id,
          point: { lat: ride.startLat, lng: ride.startLng },
          shape: 'ring' as const,
          label: formatTime(new Date(ride.startsAt), {
            timeZone: ride.startTimezone,
          }),
          color: selected ? primary : route,
          haloColor: halo,
          selected,
        };
      }),
    );
    // `plottableKey` stands in for `plottable`'s content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, plottableKey, activeId, themeVersion]);

  // Camera: frame every start point when the set of pins changes.
  useEffect(() => {
    if (!handle || plottable.length === 0) return;
    const points: LatLng[] = plottable.map((ride) => ({
      lat: ride.startLat,
      lng: ride.startLng,
    }));
    handle.fitBounds(points, FIT_OPTIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, plottableKey]);

  // Route line: the active ride's simplified geometry (CR-116), if it has one.
  const activeRoute = useMemo(
    () => rides.find((ride) => ride.id === activeId)?.routePreview ?? null,
    [rides, activeId],
  );
  useEffect(() => {
    if (!handle) return;
    if (!activeRoute || activeRoute.length < 2) {
      handle.setPolyline(null);
      return;
    }
    handle.setPolyline({
      points: activeRoute.map(([lat, lng]) => ({ lat, lng })),
      color: getCssColorVar('--route'),
      width: 6,
      outlineColor: getCssColorVar('--route-casing'),
    });
  }, [handle, activeRoute, themeVersion]);

  if (renderFailed) {
    return (
      <div data-map-unavailable className="p-4">
        <RideMapPlaceholder />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={RIDE_DISCOVERY_ROW_TERMS.mapLabel}
      className={cn('h-full w-full', className)}
    />
  );
}
