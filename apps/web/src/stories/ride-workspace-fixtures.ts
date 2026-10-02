import type {
  GetRideResponse,
  Ride,
  RideGroupSummary,
  RideParticipantSummary,
  RideUpdate,
  RouteSummary,
} from 'types';

// CR-187: story fixtures for the ride workspace — one fake `/api/v1/rides/
// ride-1/*` per story (`beforeEach`), so every tab renders from the same
// deterministic ride. Fixed dates; nothing from the mockup's scenario data.

export const RIDE_ID = 'ride-1';

export const BASE_RIDE: Ride = {
  id: RIDE_ID,
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
  distanceKm: 42,
  elevationGainMeters: 380,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

export const ROUTE: RouteSummary = {
  id: 'route-1',
  rideId: RIDE_ID,
  gpxFileName: 'losiny-ostrov.gpx',
  gpxFileSizeBytes: 48_000,
  distanceKm: 42,
  elevationGainMeters: 380,
  pointCount: 1240,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** A closed loop with a few bends — only for drawing the sketch. */
export const GEOMETRY = Array.from({ length: 60 }, (_, index) => {
  const angle = (index / 59) * Math.PI * 1.8;
  return {
    lat: 55.86 + 0.03 * Math.sin(angle) + 0.006 * Math.sin(angle * 5),
    lng: 37.76 + 0.05 * Math.cos(angle),
    elevationMeters: null,
  };
});

export const GROUPS: RideGroupSummary[] = [
  {
    id: 'g-1',
    name: 'Спокойная',
    paceKmh: 22,
    description: 'Остановки на каждой развилке',
    position: 0,
    registrationsCount: 3,
  },
  {
    id: 'g-2',
    name: 'Темповая',
    paceKmh: 27.5,
    description: null,
    position: 1,
    registrationsCount: 0,
  },
];

export function participant(
  id: string,
  displayName: string,
  extra: Partial<RideParticipantSummary> = {},
): RideParticipantSummary {
  return {
    id,
    userId: `user-${id}`,
    displayName,
    createdAt: '2026-09-20T09:30:00.000Z',
    group: null,
    finishClaimedAt: null,
    attendance: null,
    ...extra,
  };
}

export interface WorkspaceStub {
  ride?: Partial<Ride>;
  detail?: Partial<GetRideResponse>;
  updates?: RideUpdate[];
  participants?: RideParticipantSummary[];
  waitlist?: RideParticipantSummary[];
  /** Every `/rides/ride-1` read fails (the workspace's error state). */
  failRide?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A `beforeEach` that answers the workspace's reads, then restores fetch. */
export function stubWorkspace(stub: WorkspaceStub = {}) {
  return () => {
    const original = globalThis.fetch;
    const ride = { ...BASE_RIDE, ...stub.ride };
    const groups = stub.detail?.groups ?? [];
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      const base = `/api/v1/rides/${RIDE_ID}`;
      if (pathname === base) {
        if (stub.failRide) return json({ code: 'internal' }, 500);
        return json({
          ride,
          isOwner: true,
          requirements: [],
          contact: { type: 'telegram', value: '@coffee_ride' },
          route: null,
          stops: [],
          routePoints: [],
          groups,
          registrationsCount: stub.participants?.length ?? 0,
          waitlistCount: stub.waitlist?.length ?? 0,
          attendanceSummary: null,
          ...stub.detail,
        });
      }
      if (pathname === `${base}/updates`) {
        return json({ items: stub.updates ?? [], nextCursor: null });
      }
      if (pathname === `${base}/route/geometry`) {
        return json({ points: GEOMETRY });
      }
      if (pathname === `${base}/groups`) {
        return json({
          items: groups.map((group) => ({
            ...group,
            rideId: RIDE_ID,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
            updatedBy: null,
          })),
          nextCursor: null,
        });
      }
      if (pathname === `${base}/participants`) {
        return json({ items: stub.participants ?? [], nextCursor: null });
      }
      if (pathname === `${base}/waitlist`) {
        return json({ items: stub.waitlist ?? [], nextCursor: null });
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}
