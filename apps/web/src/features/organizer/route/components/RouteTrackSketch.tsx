'use client';

import { useEffect, useState } from 'react';
import { RIDE_ROUTE_TERMS, Skeleton } from 'ui';
import { getRouteGeometry, type RouteGeometryPoint } from '../api';

const WIDTH = 600;
const HEIGHT = 300;
const PADDING = 24;
// A GPX track is thousands of points; a few hundred draw the same line here.
const MAX_POINTS = 400;

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; points: RouteGeometryPoint[] };

function downsample(points: RouteGeometryPoint[]): RouteGeometryPoint[] {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from(
    { length: MAX_POINTS },
    (_, index) => points[Math.round(index * step)]!,
  );
}

/** Equirectangular fit into the view box, north up, aspect kept. */
function project(points: RouteGeometryPoint[]): Array<[number, number]> {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * cos, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min(
    (WIDTH - PADDING * 2) / spanX,
    (HEIGHT - PADDING * 2) / spanY,
  );
  const offsetX = (WIDTH - spanX * scale) / 2;
  const offsetY = (HEIGHT - spanY * scale) / 2;
  return points.map((point) => [
    offsetX + (point.lng - minLng) * cos * scale,
    offsetY + (maxLat - point.lat) * scale,
  ]);
}

/**
 * CR-187: the published route's «Трек заезда» — the stored geometry drawn as
 * a plain line with its start and finish, no basemap. Provider-free on
 * purpose: it needs no 2GIS key, can't hit a tile outage (CR-185) and shows
 * the real track, never the mockup's illustration. A failed read says so
 * and leaves the GPX download beside it as the way to the track.
 */
export function RouteTrackSketch({ rideId }: { rideId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getRouteGeometry(rideId)
      .then((points) => {
        if (!cancelled) setState({ status: 'ready', points });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (state.status === 'loading') {
    return <Skeleton className="aspect-[2/1] w-full rounded-none" />;
  }

  if (state.status === 'error' || state.points.length < 2) {
    return (
      <div className="flex aspect-[2/1] w-full items-center justify-center bg-surface p-6 text-center">
        <p className="max-w-sm text-body-sm text-text-secondary">
          {RIDE_ROUTE_TERMS.sketchUnavailable}
        </p>
      </div>
    );
  }

  const projected = project(downsample(state.points));
  const path = projected
    .map(
      ([x, y], index) =>
        `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(' ');
  const [startX, startY] = projected[0]!;
  const [finishX, finishY] = projected[projected.length - 1]!;

  return (
    <div className="flex flex-col">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={RIDE_ROUTE_TERMS.sketchLabel}
        className="aspect-[2/1] w-full bg-surface"
      >
        <path
          d={path}
          fill="none"
          className="stroke-route-casing"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path}
          fill="none"
          className="stroke-route"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={finishX}
          cy={finishY}
          r={7}
          className="fill-primary stroke-bg-raised"
          strokeWidth={3}
        />
        <circle
          cx={startX}
          cy={startY}
          r={7}
          className="fill-success stroke-bg-raised"
          strokeWidth={3}
        />
      </svg>
      {/* The dots' colours are a key, not the meaning: both are named. */}
      <p className="flex gap-4 px-4 pt-3 text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-success"
          />
          {RIDE_ROUTE_TERMS.sketchStart}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-primary"
          />
          {RIDE_ROUTE_TERMS.sketchFinish}
        </span>
      </p>
    </div>
  );
}
