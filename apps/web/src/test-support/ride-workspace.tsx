import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Ride } from 'types';
import {
  RideWorkspaceContext,
  type RideWorkspaceContextValue,
  type RideWorkspaceData,
} from '@/lib/cabinet/ride-workspace';

// KI-085: section tests render a section inside the ride workspace's context
// without the frame itself (its own read is `rides.test.tsx`'s business), to
// check the section takes the workspace's ride instead of reading it again.

const WORKSPACE_RIDE: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утро на Лосином острове',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2099-10-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: null,
  distanceKm: null,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'draft',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

export function workspaceData({
  ride,
  ...rest
}: { ride?: Partial<Ride> } & Partial<
  Omit<RideWorkspaceData, 'ride'>
> = {}): RideWorkspaceData {
  return {
    ride: { ...WORKSPACE_RIDE, ...ride },
    route: null,
    stops: [],
    routePoints: [],
    groups: [],
    registrationsCount: 0,
    waitlistCount: 0,
    attendanceSummary: null,
    requirements: [],
    contact: undefined,
    latestUpdate: null,
    ...rest,
  };
}

/**
 * The workspace's context with `data`; its `refresh()` (the frame's quiet
 * re-read) answers with `reread()` when given — pass a `vi.fn` to see whether
 * a section asked the workspace instead of the API.
 */
export function TestRideWorkspace({
  data,
  reread,
  children,
}: {
  data: RideWorkspaceData;
  reread?: () => RideWorkspaceData;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(data);
  const refresh = useCallback(async () => {
    if (reread) setCurrent(reread());
  }, [reread]);
  const applyRide = useCallback((ride: Ride) => {
    setCurrent((previous) => ({ ...previous, ride }));
  }, []);
  const value = useMemo<RideWorkspaceContextValue>(
    () => ({ data: current, sections: [], refresh, applyRide }),
    [current, refresh, applyRide],
  );
  return (
    <RideWorkspaceContext.Provider value={value}>
      {children}
    </RideWorkspaceContext.Provider>
  );
}
