'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapHandle } from 'maps-core';
import type { RouteGeometryPoint, RoutePoint, Stop } from 'types';
import { ROUTE_POINT_TYPE_TERMS, ROUTE_RENDERING_TERMS, STOPS_TERMS } from 'ui';
import { createMapRenderer } from '@/lib/maps/create-map-renderer';
import { getCssColorVar } from '@/lib/maps/css-color';
import {
  ROUTE_POINT_MARKER_COLOR_VAR,
  ROUTE_POINT_MARKER_LABEL,
  STOP_MARKER_COLOR_VAR,
  STOP_MARKER_LABEL,
} from '../lib/route-point-colors';
import { RouteMapPlaceholder } from './RouteMapPlaceholder';

// Moscow — same non-empty fallback center as `DiscoveryMap`'s own constant
// (duplicated, not imported: `.claude/rules/extensibility.md` forbids one
// feature module reaching into another's internals).
const DEFAULT_CENTER = { lat: 55.7558, lng: 37.6173 };

/**
 * `/rides/[id]`'s route map (KI-036, ADR-020): replaces the always-shown
 * `RouteMapPlaceholder` with a real MapGL render — `Route.geometry` as a
 * polyline plus typed `RoutePoint`/`Stop` markers, reusing the same
 * `MapRenderer`/`MapHandle` interface `DiscoveryMap` already proved out
 * (CR-098), extended additively with `setPolyline`/marker `color`+`label`
 * rather than a second render abstraction. Falls back to the same
 * placeholder whenever no key is configured or the render itself fails
 * (`docs/design.md` §10's degraded-state requirement — this component must
 * never show a blank panel).
 */
export function RouteMap({
  geometry,
  routePoints,
  stops,
}: {
  geometry: RouteGeometryPoint[];
  routePoints: RoutePoint[];
  stops: Stop[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) {
      setRenderFailed(!renderer);
      return;
    }

    const center = geometry[0] ?? routePoints[0] ?? stops[0] ?? DEFAULT_CENTER;

    let cancelled = false;
    let handle: MapHandle | undefined;

    renderer
      .render({
        container: containerRef.current,
        center: { lat: center.lat, lng: center.lng },
        zoom: 13,
      })
      .then((renderedHandle) => {
        if (cancelled) {
          renderedHandle.destroy();
          return;
        }
        handle = renderedHandle;
        handle.setPolyline(
          geometry.length >= 2
            ? {
                points: geometry,
                color: getCssColorVar('--primary'),
              }
            : null,
        );
        handle.setMarkers([
          ...routePoints.map((point) => ({
            id: point.id,
            point: { lat: point.lat, lng: point.lng },
            color: getCssColorVar(ROUTE_POINT_MARKER_COLOR_VAR[point.type]),
            label: ROUTE_POINT_MARKER_LABEL[point.type],
          })),
          ...stops.map((stop) => ({
            id: stop.id,
            point: { lat: stop.lat, lng: stop.lng },
            color: getCssColorVar(STOP_MARKER_COLOR_VAR),
            label: STOP_MARKER_LABEL,
          })),
        ]);
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });

    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // Intentionally run once — this component only mounts once its data is
    // already loaded (`RouteSection` renders it only after the geometry
    // fetch resolves), same reasoning as `DiscoveryMap`'s own single-render
    // effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (renderFailed) {
    return <RouteMapPlaceholder />;
  }

  const legendTypes = [...new Set(routePoints.map((point) => point.type))];

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        role="img"
        aria-label={ROUTE_RENDERING_TERMS.sectionTitle}
        className="h-80 w-full overflow-hidden rounded-lg"
      />
      {(legendTypes.length > 0 || stops.length > 0) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          {legendTypes.map((type) => (
            <li key={type} className="flex items-center gap-1.5">
              <span aria-hidden className="font-mono">
                {ROUTE_POINT_MARKER_LABEL[type]}
              </span>
              {ROUTE_POINT_TYPE_TERMS[type]}
            </li>
          ))}
          {stops.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="font-mono">
                {STOP_MARKER_LABEL}
              </span>
              {STOPS_TERMS.sectionTitle}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
