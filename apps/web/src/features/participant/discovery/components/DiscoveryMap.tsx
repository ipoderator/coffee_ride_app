'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapHandle } from 'maps-core';
import type { PublicRide } from 'types';
import { RIDE_DISCOVERY_TERMS } from 'ui';
import { createMapRenderer } from '@/lib/maps/create-map-renderer';
import { RideMapPlaceholder } from './RideMapPlaceholder';

// A ride with no start location can't get a pin — same "missing data" stance
// the rest of the app takes (`docs/design.md` §6/§7: absent, never a fake 0).
type PlottableRide = PublicRide & { startLat: number; startLng: number };

function isPlottable(ride: PublicRide): ride is PlottableRide {
  return ride.startLat !== null && ride.startLng !== null;
}

// Moscow — a reasonable default center when no ride has a start location yet
// (an empty/loading result, or every ride missing coordinates). Not a design
// decision about the platform's home city, just a non-empty fallback so the
// map has somewhere to point before any pin exists.
const DEFAULT_CENTER = { lat: 55.7558, lng: 37.6173 };

/**
 * `/`'s map view (CR-098/ADR-020) — replaces `RideMapPlaceholder` with a
 * real MapGL render, now that a live `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`
 * exists. Falls back to the same placeholder (`docs/design.md` §10's
 * degraded-state requirement) whenever no key is configured or the render
 * itself fails — this component must never show a blank panel.
 */
export function DiscoveryMap({ rides }: { rides: PublicRide[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const plottableRides = rides.filter(isPlottable);

  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) {
      setRenderFailed(!renderer);
      return;
    }

    let cancelled = false;
    let handle: MapHandle | undefined;

    renderer
      .render({
        container: containerRef.current,
        center: plottableRides[0]
          ? { lat: plottableRides[0].startLat, lng: plottableRides[0].startLng }
          : DEFAULT_CENTER,
        zoom: plottableRides.length > 0 ? 11 : 9,
      })
      .then((renderedHandle) => {
        if (cancelled) {
          renderedHandle.destroy();
          return;
        }
        handle = renderedHandle;
        handle.setMarkers(
          plottableRides.map((ride) => ({
            id: ride.id,
            point: { lat: ride.startLat, lng: ride.startLng },
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });

    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // Intentionally run once: re-rendering the whole map on every ride list
    // change would tear down and rebuild it on every filter keystroke; a
    // real "update markers in place" path is follow-up work once this first
    // render is proven, not this ticket's scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (renderFailed) {
    return <RideMapPlaceholder />;
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={RIDE_DISCOVERY_TERMS.viewMapLabel}
      className="h-120 w-full overflow-hidden rounded-lg"
    />
  );
}
