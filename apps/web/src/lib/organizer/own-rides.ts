import type {
  ListRidesResponse,
  Paginated,
  ProblemDetails,
  Ride,
  RideParticipantSummary,
} from 'types';
import { ApiError } from '@/lib/api/errors';

// CR-131: organizer-cabinet reads several feature modules share — the
// caller's own rides, a ride's full participant list, and the "nearest ride"
// the dashboard's KPI cells, «Отправить обновление» and the sidebar's
// «Участники»/«Обновления» items all point at. Cross-cutting on purpose
// (`.claude/rules/extensibility.md`: shared logic lives outside any one
// feature module), so every feature reads the same definition.

const RIDES_ENDPOINT = '/api/v1/rides';

// ADR-011's server-side page cap (`apps/api/src/lib/cursor.ts`'s `maxLimit`).
const PAGE_LIMIT = 100;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as T | ProblemDetails;
  if (!response.ok) throw new ApiError(body as ProblemDetails);
  return body as T;
}

// CR-133 (KI-066): concurrent identical GETs share one request — the sidebar
// badge and the dashboard widgets all read `/rides/mine` and the nearest
// ride's participants at mount. De-duplication only, not a cache: the entry
// is dropped the moment it settles (success or failure), so a later read
// always hits the network. The parsed body is shared uncloned — every caller
// only reads it (filter/find/map/spread, no in-place sort or push).
const inFlight = new Map<string, Promise<unknown>>();

function getJson<T>(url: string): Promise<T> {
  const pending = inFlight.get(url) as Promise<T> | undefined;
  if (pending) return pending;
  const request = fetchJson<T>(url).finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

/**
 * Statuses a ride can be "coming up" in. A `started` ride is the nearest one
 * while it's under way, whatever its `startsAt` says.
 */
const UPCOMING_STATUSES: ReadonlySet<Ride['status']> = new Set([
  'published',
  'registration_open',
  'registration_closed',
]);

/**
 * The ride under way (`started`), else the soonest-starting published ride
 * whose start is still ahead. `null` when there is none.
 */
export function pickNearestRide(rides: Ride[], now: Date): Ride | null {
  const started = rides.find((ride) => ride.status === 'started');
  if (started) return started;
  const upcoming = rides
    .filter(
      (ride) =>
        UPCOMING_STATUSES.has(ride.status) &&
        new Date(ride.startsAt).getTime() > now.getTime(),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  return upcoming[0] ?? null;
}

/**
 * The caller's own rides (`GET /v1/rides/mine`, newest first), one page at
 * the server cap.
 */
export async function listOwnRidesPage(): Promise<Ride[]> {
  const page = await getJson<ListRidesResponse>(
    `${RIDES_ENDPOINT}/mine?limit=${PAGE_LIMIT}`,
  );
  return page.items;
}

/**
 * Every item of a paginated `/v1/rides/:id/<collection>` read, following
 * `nextCursor` up to `maxPages` pages — a ride's participant limit keeps this
 * at one page in practice; the cap only bounds a pathological case.
 */
async function listAllPages<T>(path: string, maxPages: number): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) query.set('cursor', cursor);
    const response: Paginated<T> = await getJson<Paginated<T>>(
      `${path}?${query.toString()}`,
    );
    items.push(...response.items);
    cursor = response.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/**
 * Every active registration on one of the caller's rides (`GET
 * /v1/rides/:id/participants`, `createdAt asc`).
 */
export function listAllRideParticipants(
  rideId: string,
  maxPages = 3,
): Promise<RideParticipantSummary[]> {
  return listAllPages(`${RIDES_ENDPOINT}/${rideId}/participants`, maxPages);
}

/**
 * CR-132: the ride's waitlist (`GET /v1/rides/:id/waitlist`, `waiting`
 * entries) — the dashboard's «Лист ожидания» cell for the nearest ride.
 */
export function listAllRideWaitlist(
  rideId: string,
  maxPages = 3,
): Promise<RideParticipantSummary[]> {
  return listAllPages(`${RIDES_ENDPOINT}/${rideId}/waitlist`, maxPages);
}

const DAY_MS = 86_400_000;

/**
 * Registrations made in the 24 hours before `now` — the «+3 за сутки» KPI
 * note and (CR-132) the sidebar «Участники» badge, one definition for both.
 */
export function registrationsInLastDay(
  participants: RideParticipantSummary[],
  now: Date,
): number {
  const since = now.getTime() - DAY_MS;
  return participants.filter(
    (participant) => new Date(participant.createdAt).getTime() > since,
  ).length;
}

export async function fetchNearestOwnRide(
  now: Date = new Date(),
): Promise<Ride | null> {
  return pickNearestRide(await listOwnRidesPage(), now);
}
