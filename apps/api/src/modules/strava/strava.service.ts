import { and, eq, sql } from 'drizzle-orm';
import { registrations, rides, routes } from 'db/schema';
import type { DbClient } from 'db';
import type { StravaSyncOutcome } from 'types';
import {
  StravaRejectedError,
  StravaUnavailableError,
  type StravaClient,
} from './strava-client.js';
import {
  activityWindow,
  decodePolyline,
  matchActivity,
  type LatLng,
  type MatchDiagnostics,
} from './match.js';
import { createOAuthState, readOAuthState } from './oauth-state.js';

// CR-234 (ADR-033): «Синхронизировать со Strava». One-shot OAuth — the access token
// lives only inside `completeStravaSync`'s call and is revoked before it returns, so
// nothing about the athlete's Strava account is ever stored. A match writes the same
// claim CR-181's «Я финишировал» writes, plus the evidence mark; `attendance` stays
// the organizer's (ADR-027).

export class StravaServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'StravaServiceError';
  }
}

const REGISTRATION_NOT_FOUND = () =>
  new StravaServiceError(
    'registration_not_found',
    404,
    'Registration not found',
    'You do not have an active registration for this ride.',
  );
const RIDE_NOT_IN_PROGRESS = () =>
  new StravaServiceError(
    'ride_not_in_progress',
    409,
    'Ride has not started',
    'A finish can only be verified once the ride has started.',
  );
const ATTENDANCE_ALREADY_DECIDED = () =>
  new StravaServiceError(
    'attendance_already_decided',
    409,
    'Attendance already decided',
    'The organizer has already recorded your outcome for this ride.',
  );

// Same window as CR-181's claim (`registrations.service.ts`).
const ATTENDANCE_OPEN_STATUSES = new Set(['started', 'finished']);
const STRAVA_CALLBACK_PATH = '/api/v1/strava/callback';

export interface StravaSyncConfig {
  authSecret: string;
  webOrigin: string;
}

export function stravaRedirectUri(webOrigin: string): string {
  return new URL(STRAVA_CALLBACK_PATH, webOrigin).toString();
}

type SyncGate = 'ok' | 'not_registered' | 'not_in_progress' | 'decided';

async function checkSyncGate(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<SyncGate> {
  const [row] = await db
    .select({
      rideStatus: rides.status,
      attendance: registrations.attendance,
    })
    .from(registrations)
    .innerJoin(rides, eq(registrations.rideId, rides.id))
    .where(
      and(
        eq(registrations.rideId, rideId),
        eq(registrations.userId, userId),
        eq(registrations.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) return 'not_registered';
  if (!ATTENDANCE_OPEN_STATUSES.has(row.rideStatus)) return 'not_in_progress';
  if (row.attendance !== null) return 'decided';
  return 'ok';
}

/**
 * The participant pressed the button: their own active registration, a ride that has
 * started, no organizer decision yet. Returns where to send the browser.
 */
export async function startStravaSync(
  db: DbClient,
  client: StravaClient,
  config: StravaSyncConfig,
  userId: string,
  rideId: string,
): Promise<string> {
  const gate = await checkSyncGate(db, userId, rideId);
  if (gate === 'not_registered') throw REGISTRATION_NOT_FOUND();
  if (gate === 'not_in_progress') throw RIDE_NOT_IN_PROGRESS();
  if (gate === 'decided') throw ATTENDANCE_ALREADY_DECIDED();
  return client.authorizeUrl({
    redirectUri: stravaRedirectUri(config.webOrigin),
    state: createOAuthState(config.authSecret, { userId, rideId }),
  });
}

export interface StravaCallbackQuery {
  code?: string;
  state?: string;
  scope?: string;
  error?: string;
}

// The callback's own log sink: a failed revoke, and what each check saw (counts and
// a ratio only — never a token, a coordinate or the athlete's activity data).
export interface StravaSyncLog {
  warn: (message: string, error: unknown) => void;
  info: (
    message: string,
    details: { outcome: StravaSyncOutcome } & Partial<MatchDiagnostics>,
  ) => void;
}

export interface StravaCallbackResult {
  // `null` when the state could not be trusted — the caller then has no ride to
  // return to.
  rideId: string | null;
  outcome: StravaSyncOutcome;
}

/**
 * Strava sent the participant back. Every expected failure is an outcome, not an
 * exception: the browser is mid-redirect and must land on the ride page with a
 * message, never on an API error body.
 */
export async function completeStravaSync(
  db: DbClient,
  client: StravaClient,
  config: StravaSyncConfig,
  sessionUserId: string | null,
  query: StravaCallbackQuery,
  log: StravaSyncLog,
): Promise<StravaCallbackResult> {
  const state = query.state
    ? readOAuthState(config.authSecret, query.state)
    : null;
  if (!state || state.userId !== sessionUserId) {
    return { rideId: null, outcome: 'error' };
  }
  const { userId, rideId } = state;
  const result = (outcome: StravaSyncOutcome) => ({ rideId, outcome });

  if (query.error || !query.code) {
    return result('denied');
  }

  // Exchanged before any other check, so that every path below revokes the grant
  // the athlete just gave — a new Strava app counts each authorized athlete
  // against its capacity.
  let accessToken: string;
  try {
    accessToken = await client.exchangeCode(query.code);
  } catch (error) {
    if (error instanceof StravaRejectedError) return result('error');
    if (error instanceof StravaUnavailableError) return result('unavailable');
    throw error;
  }

  try {
    const gate = await checkSyncGate(db, userId, rideId);
    if (gate !== 'ok') {
      return result(gate === 'decided' ? 'already_decided' : 'error');
    }
    // Strava lets the athlete untick the activity permission on its consent
    // screen; `scope` echoes what was actually granted.
    const scopes = (query.scope ?? '').split(',');
    if (!scopes.some((scope) => scope.startsWith('activity:read'))) {
      return result('denied');
    }
    const ride = await loadRideForMatch(db, rideId);
    if (!ride) return result('error');
    let match;
    try {
      const activities = await client.listActivities(
        accessToken,
        activityWindow(ride.startsAt),
      );
      // The list's `summary_polyline` first; Strava leaves it empty for some
      // athletes' activities, and then the activity's own track stream is read.
      match = await matchActivity(ride, activities, async (activity) =>
        activity.summaryPolyline
          ? decodePolyline(activity.summaryPolyline)
          : client.getActivityTrack(accessToken, activity.id),
      );
    } catch (error) {
      if (error instanceof StravaRejectedError) return result('error');
      if (error instanceof StravaUnavailableError) {
        return result('unavailable');
      }
      throw error;
    }
    log.info('Strava sync checked', {
      outcome: match.outcome,
      ...match.diagnostics,
    });
    if (match.outcome !== 'verified') return result(match.outcome);
    const written = await recordVerification(
      db,
      userId,
      rideId,
      match.activityId,
    );
    return result(written ? 'verified' : 'already_decided');
  } finally {
    // One-shot grant: end it whatever happened above. Best effort — a failed
    // revoke leaves only Strava's own record of the authorization (the athlete can
    // revoke it in their Strava settings); the token itself was never stored.
    await client.deauthorize(accessToken).catch((error: unknown) => {
      log.warn('Strava deauthorize failed', error);
    });
  }
}

async function loadRideForMatch(db: DbClient, rideId: string) {
  const [row] = await db
    .select({
      startsAt: rides.startsAt,
      startLat: rides.startLat,
      startLng: rides.startLng,
      distanceKm: rides.distanceKm,
      geometry: routes.geometry,
    })
    .from(rides)
    .leftJoin(routes, eq(routes.rideId, rides.id))
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!row) return null;
  return {
    startsAt: row.startsAt,
    routeGeometry: toLatLngs(row.geometry),
    start:
      row.startLat !== null && row.startLng !== null
        ? { lat: row.startLat, lng: row.startLng }
        : null,
    distanceKm: row.distanceKm,
  };
}

// `routes.geometry` is `jsonb` written by `rides.service.ts` as
// `RouteGeometryPoint[]`; read defensively all the same.
function toLatLngs(value: unknown): LatLng[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point: unknown) => {
    if (typeof point !== 'object' || point === null) return [];
    const { lat, lng } = point as { lat?: unknown; lng?: unknown };
    return typeof lat === 'number' && typeof lng === 'number'
      ? [{ lat, lng }]
      : [];
  });
}

// Re-checks the gate in the UPDATE itself: the organizer may have decided while the
// participant was on Strava's consent screen. Keeps an earlier claim's timestamp.
async function recordVerification(
  db: DbClient,
  userId: string,
  rideId: string,
  activityId: string,
): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(registrations)
    .set({
      finishClaimedAt: sql`coalesce(${registrations.finishClaimedAt}, ${now.toISOString()}::timestamptz)`,
      stravaVerifiedAt: now,
      stravaActivityId: BigInt(activityId),
      updatedAt: now,
    })
    .where(
      and(
        eq(registrations.rideId, rideId),
        eq(registrations.userId, userId),
        eq(registrations.status, 'active'),
        sql`${registrations.attendance} is null`,
      ),
    )
    .returning({ id: registrations.id });
  return updated.length > 0;
}
