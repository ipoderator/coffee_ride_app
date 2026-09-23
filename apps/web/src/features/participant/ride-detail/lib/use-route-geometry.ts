'use client';

import { useEffect, useState } from 'react';
import type { RouteGeometryPoint } from 'types';
import { getRouteGeometry } from '../api';

export type GeometryStatus = 'loading' | 'ready' | 'error';

/**
 * CR-028's separate geometry fetch (`GetRideResponse.route` deliberately omits
 * the point array — KI-035), lifted into a hook by CR-119: the map (left column)
 * and the elevation profile (margin panel) now sit apart, and both draw from the
 * one request. A failure degrades both locally instead of blanking the page
 * (`.claude/rules/resilience.md`); `retry` re-runs it. With no route there is
 * nothing to fetch and the status is `ready` with no points.
 */
export function useRouteGeometry(rideId: string, routeId: string | null) {
  const [status, setStatus] = useState<GeometryStatus>(
    routeId ? 'loading' : 'ready',
  );
  const [points, setPoints] = useState<RouteGeometryPoint[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!routeId) {
      setStatus('ready');
      setPoints([]);
      return;
    }
    let cancelled = false;
    setStatus('loading');

    getRouteGeometry(rideId)
      .then((response) => {
        if (cancelled) return;
        setPoints(response.points);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId, routeId, attempt]);

  return { status, points, retry: () => setAttempt((n) => n + 1) };
}
