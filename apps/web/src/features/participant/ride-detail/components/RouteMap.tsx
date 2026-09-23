'use client';

import { useEffect, useRef, useState } from 'react';
import type { LatLng, MapHandle } from 'maps-core';
import type { RouteGeometryPoint, RoutePoint, Stop } from 'types';
import { cn, ROUTE_RENDERING_TERMS } from 'ui';
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
  start = null,
  className,
}: {
  geometry: RouteGeometryPoint[];
  routePoints: RoutePoint[];
  stops: Stop[];
  /** The ride's own start point (`Ride.startLat`/`startLng`) — pinned as a
   * start marker unless a `start` route point already marks it. */
  start?: LatLng | null;
  /** Sizing/framing for the map surface itself (height, rounding, border);
   * defaults to `h-80`. Also applied to the degraded placeholder, so a failed
   * render keeps the map's footprint instead of collapsing the layout. */
  className?: string;
}) {
  const hasStartRoutePoint = routePoints.some(
    (point) => point.type === 'start',
  );
  const showStartMarker = start !== null && !hasStartRoutePoint;

  const containerRef = useRef<HTMLDivElement>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) {
      setRenderFailed(!renderer);
      return;
    }

    // Every point that should be in view — the whole line plus every pin —
    // so the camera frames the entire ride instead of zooming in on its
    // first point and leaving most of the route off-screen.
    const framedPoints: LatLng[] = [
      ...geometry,
      ...routePoints,
      ...stops,
      ...(showStartMarker && start ? [start] : []),
    ].map((point) => ({ lat: point.lat, lng: point.lng }));
    const center = framedPoints[0] ?? DEFAULT_CENTER;

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
                // ADR-021 («Топокарта»): the route is the overprint ink,
                // 6px over the renderer's 4px default, no glow.
                color: getCssColorVar('--route'),
                width: 6,
                // Casing (paper in light, graphite in dark) keeps the line
                // legible over any basemap detail (roads, water, parks).
                outlineColor: getCssColorVar('--route-casing'),
              }
            : null,
        );
        handle.setMarkers([
          ...(showStartMarker && start
            ? [
                {
                  id: 'ride-start',
                  point: start,
                  color: getCssColorVar(ROUTE_POINT_MARKER_COLOR_VAR.start),
                  label: ROUTE_POINT_MARKER_LABEL.start,
                },
              ]
            : []),
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
        handle.fitBounds(framedPoints, { padding: 48, maxZoom: 15 });
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
    return <RouteMapPlaceholder className={className} />;
  }

  // CR-119: the key to these pins is `RouteLegend` («Условные знаки»), a
  // separate section of the page — not a chip row glued under the map.
  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ROUTE_RENDERING_TERMS.sectionTitle}
      className={cn('h-80 w-full overflow-hidden rounded-lg', className)}
    />
  );
}
