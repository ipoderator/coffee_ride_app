'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RideStatus } from 'types';
import {
  ApiError,
  getRideStatus,
  listRideGroups,
  type RideGroupWithCount,
} from '../api';

export type RideGroupsLoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * CR-120: the ride's status + its groups, loaded together on mount (and on a
 * retry). `refresh` re-reads only the groups after a mutation — the ride status
 * doesn't change from this screen, and a stale status is corrected anyway by the
 * server's `409 ride_groups_not_editable`.
 */
export function useRideGroups(rideId: string) {
  const [status, setStatus] = useState<RideGroupsLoadStatus>('loading');
  const [rideStatus, setRideStatus] = useState<RideStatus | null>(null);
  const [groups, setGroups] = useState<RideGroupWithCount[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([getRideStatus(rideId), listRideGroups(rideId)])
      .then(([nextRideStatus, response]) => {
        if (cancelled) return;
        setRideStatus(nextRideStatus);
        setGroups(response.items);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(
          error instanceof ApiError && error.problem.status === 404
            ? 'not-found'
            : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, attempt]);

  const refresh = useCallback(async () => {
    const response = await listRideGroups(rideId);
    setGroups(response.items);
  }, [rideId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, rideStatus, groups, refresh, retry };
}
