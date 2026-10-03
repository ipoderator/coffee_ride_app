import type {
  GetRideResponse,
  Ride,
  RegistrationAttendance,
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
  /**
   * CR-189: finish marks stick — `PUT .../attendance` changes the stubbed
   * participants, `POST .../finish` the ride's status, and the ride read
   * reports the matching `attendanceSummary`, like the API. Without it the
   * summary stays `null` and neither call is answered.
   */
  liveAttendance?: boolean;
}

function summarize(items: readonly RideParticipantSummary[]) {
  const summary = { finished: 0, dnf: 0, noShow: 0, unresolved: 0 };
  for (const item of items) {
    if (item.attendance === 'finished') summary.finished += 1;
    else if (item.attendance === 'dnf') summary.dnf += 1;
    else if (item.attendance === 'no_show') summary.noShow += 1;
    else summary.unresolved += 1;
  }
  return summary;
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
    let ride = { ...BASE_RIDE, ...stub.ride };
    const groups = stub.detail?.groups ?? [];
    // A private copy: a mark changes it, never the story's own fixture.
    const participants = (stub.participants ?? []).map((item) => ({
      ...item,
    }));
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
          registrationsCount: participants.length,
          waitlistCount: stub.waitlist?.length ?? 0,
          attendanceSummary: stub.liveAttendance
            ? summarize(participants)
            : null,
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
        return json({ items: participants, nextCursor: null });
      }
      if (
        stub.liveAttendance &&
        pathname === `${base}/finish` &&
        init?.method === 'POST'
      ) {
        ride = { ...ride, status: 'finished' };
        return json({ ride });
      }
      if (
        stub.liveAttendance &&
        pathname === `${base}/attendance` &&
        init?.method === 'PUT'
      ) {
        const { registrationIds, attendance } = JSON.parse(
          String(init.body),
        ) as {
          registrationIds: string[];
          attendance: RegistrationAttendance | null;
        };
        for (const item of participants) {
          if (registrationIds.includes(item.id)) item.attendance = attendance;
        }
        return json({ updated: registrationIds.length });
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
