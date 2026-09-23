'use client';

import { useEffect, useRef, useState } from 'react';
import type { LatLng, MapHandle } from 'maps-core';
import { ROUTE_BUILDER_MAX_POINTS } from 'types';
import {
  Button,
  Card,
  ErrorState,
  RIDE_ROUTE_BUILDER_TERMS,
  useToast,
} from 'ui';
import { createMapRenderer } from '@/lib/maps/create-map-renderer';
import { getCssColorVar } from '@/lib/maps/css-color';
import {
  ApiError,
  buildRoute,
  getRouteGeometry,
  type RouteGeometryPoint,
} from '../api';

// Moscow — the same non-empty fallback center the other maps use when there
// is nothing ride-specific to point at yet.
const DEFAULT_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };

type BuildError = 'not-buildable' | 'unavailable' | 'generic' | null;

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

/**
 * CR-114 ("Route builder"): the organizer clicks waypoints on the map, the
 * API routes them along 2GIS roads (`POST /v1/rides/:id/route/build`) and
 * stores the result as the ride's route. The line on this map is always the
 * stored 2GIS geometry — never the waypoints joined by straight lines — so
 * what the organizer sees is exactly what participants will see.
 *
 * Waypoints live only in this component: the API stores the resulting line,
 * not the points that produced it, so a reload starts from an empty set
 * (the stored line still shows).
 */
export function RouteBuilder({
  rideId,
  hasRoute,
  start,
  onBuilt,
}: {
  rideId: string;
  /** Whether the ride already has a route (uploaded or built) to show. */
  hasRoute: boolean;
  /** The ride's start point, if set — where the map opens. */
  start: LatLng | null;
  /** Refreshes the parent's route summary after a successful build. */
  onBuilt: () => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [geometry, setGeometry] = useState<RouteGeometryPoint[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [buildError, setBuildError] = useState<BuildError>(null);
  const [limitReached, setLimitReached] = useState(false);
  const { showToast } = useToast();

  // One map for the component's lifetime. Clicks append a waypoint through a
  // functional update, so the handler never sees stale state.
  useEffect(() => {
    const renderer = createMapRenderer();
    if (!renderer || !containerRef.current) {
      setMapFailed(!renderer);
      return;
    }

    let cancelled = false;
    renderer
      .render({
        container: containerRef.current,
        center: start ?? DEFAULT_CENTER,
        zoom: start ? 13 : 10,
        onClick: (point) => {
          setBuildError(null);
          setWaypoints((current) => {
            if (current.length >= ROUTE_BUILDER_MAX_POINTS) {
              setLimitReached(true);
              return current;
            }
            return [...current, point];
          });
        },
      })
      .then((handle) => {
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapFailed(true);
      });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Intentionally once — same single-render reasoning as `DiscoveryMap`/
    // `RouteMap`; markers and the line update in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The stored route line, if any, so a rebuild is compared against it.
  useEffect(() => {
    if (!hasRoute) {
      setGeometry([]);
      return;
    }
    let cancelled = false;
    getRouteGeometry(rideId)
      .then((points) => {
        if (!cancelled) setGeometry(points);
      })
      .catch(() => {
        // The builder stays usable without the old line — nothing to show.
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, hasRoute]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setPolyline(
      geometry.length >= 2
        ? {
            points: geometry,
            // ADR-021: same overprint route line + casing as `RouteMap`.
            color: getCssColorVar('--route'),
            width: 6,
            outlineColor: getCssColorVar('--route-casing'),
          }
        : null,
    );
    if (geometry.length >= 2) {
      handle.fitBounds(geometry, { padding: 40 });
    }
  }, [geometry, mapReady]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setMarkers(
      waypoints.map((point, index) => ({
        id: `waypoint-${index}`,
        point,
        color: getCssColorVar(
          index === 0
            ? '--success'
            : index === waypoints.length - 1
              ? '--danger'
              : '--info',
        ),
        label: String(index + 1),
      })),
    );
  }, [waypoints, mapReady]);

  function updateWaypoints(next: LatLng[]) {
    setWaypoints(next);
    setBuildError(null);
    setLimitReached(false);
  }

  async function handleBuild() {
    if (isPending || waypoints.length < 2) return;
    setBuildError(null);
    setIsPending(true);
    try {
      await buildRoute(rideId, waypoints);
      const points = await getRouteGeometry(rideId).catch(() => []);
      setGeometry(points);
      await onBuilt();
      showToast(RIDE_ROUTE_BUILDER_TERMS.buildSuccess);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.problem.code === 'route_not_buildable') {
          setBuildError('not-buildable');
        } else if (error.problem.code === 'route_builder_unavailable') {
          setBuildError('unavailable');
        } else {
          setBuildError('generic');
        }
      } else {
        setBuildError('generic');
      }
    } finally {
      setIsPending(false);
    }
  }

  const first = waypoints[0];
  const canCloseLoop =
    first !== undefined &&
    waypoints.length >= 2 &&
    waypoints.length < ROUTE_BUILDER_MAX_POINTS;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text">
          {RIDE_ROUTE_BUILDER_TERMS.sectionTitle}
        </h2>
        <p className="text-sm text-text-secondary">
          {RIDE_ROUTE_BUILDER_TERMS.description}
        </p>
      </div>

      {mapFailed ? (
        <ErrorState
          message={RIDE_ROUTE_BUILDER_TERMS.mapUnavailable}
          tone="warning"
          variant="inline"
        />
      ) : (
        <div
          ref={containerRef}
          role="application"
          aria-label={RIDE_ROUTE_BUILDER_TERMS.mapLabel}
          className="h-96 w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
        />
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary tabular-nums">
          {RIDE_ROUTE_BUILDER_TERMS.pointsCount(
            waypoints.length,
            ROUTE_BUILDER_MAX_POINTS,
          )}
        </p>
        {waypoints.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {RIDE_ROUTE_BUILDER_TERMS.emptyPoints}
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {waypoints.map((point, index) => (
              <li
                // Points are positional — index is their identity here.
                key={index}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="text-text">
                  {RIDE_ROUTE_BUILDER_TERMS.pointLabel(index + 1)}
                  <span className="ml-2 text-text-secondary tabular-nums">
                    {formatCoordinate(point.lat)}, {formatCoordinate(point.lng)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateWaypoints(waypoints.filter((_, i) => i !== index))
                  }
                  disabled={isPending}
                  aria-label={RIDE_ROUTE_BUILDER_TERMS.removePoint(index + 1)}
                  className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        {limitReached && (
          <p role="status" className="text-sm text-warning">
            {RIDE_ROUTE_BUILDER_TERMS.tooManyPoints(ROUTE_BUILDER_MAX_POINTS)}
          </p>
        )}
      </div>

      {buildError === 'not-buildable' && (
        <p role="alert" className="text-sm text-danger">
          {RIDE_ROUTE_BUILDER_TERMS.notBuildable}
        </p>
      )}
      {buildError === 'unavailable' && (
        <ErrorState
          message={RIDE_ROUTE_BUILDER_TERMS.unavailable}
          tone="warning"
          variant="inline"
        />
      )}
      {buildError === 'generic' && (
        <p role="alert" className="text-sm text-danger">
          {RIDE_ROUTE_BUILDER_TERMS.unavailable}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          isLoading={isPending}
          disabled={waypoints.length < 2 || mapFailed}
          onClick={handleBuild}
        >
          {isPending
            ? RIDE_ROUTE_BUILDER_TERMS.buildPending
            : RIDE_ROUTE_BUILDER_TERMS.build}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canCloseLoop || isPending}
          onClick={() => first && updateWaypoints([...waypoints, first])}
        >
          {RIDE_ROUTE_BUILDER_TERMS.closeLoop}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={waypoints.length === 0 || isPending}
          onClick={() => updateWaypoints(waypoints.slice(0, -1))}
        >
          {RIDE_ROUTE_BUILDER_TERMS.undo}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={waypoints.length === 0 || isPending}
          onClick={() => updateWaypoints([])}
        >
          {RIDE_ROUTE_BUILDER_TERMS.clear}
        </Button>
      </div>
      {waypoints.length === 1 && (
        <p className="text-sm text-text-secondary">
          {RIDE_ROUTE_BUILDER_TERMS.needMorePoints}
        </p>
      )}
    </Card>
  );
}
