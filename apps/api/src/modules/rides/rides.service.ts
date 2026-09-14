import { eq } from 'drizzle-orm';
import { organizerProfiles, rides } from 'db/schema';
import type { DbClient } from 'db';
import type { CreateRideRequest, Ride } from 'types';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `OrganizerServiceError`/`AuthServiceError` (`.claude/rules/backend.md`: route ->
// validation -> service -> repository).
export class RideServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'RideServiceError';
  }
}

const ORGANIZER_PROFILE_REQUIRED = () =>
  new RideServiceError(
    'organizer_profile_required',
    403,
    'Organizer profile required',
    'Create an organizer profile before creating a ride.',
  );

function toPublicRide(row: typeof rides.$inferSelect): Ride {
  return {
    id: row.id,
    organizerId: row.organizerId,
    title: row.title,
    description: row.description,
    coverImageUrl: row.coverImageUrl,
    bicycleType: row.bicycleType,
    startsAt: row.startsAt.toISOString(),
    startTimezone: row.startTimezone,
    participantLimit: row.participantLimit,
    priceRub: row.priceRub,
    distanceKm: row.distanceKm,
    elevationGainMeters: row.elevationGainMeters,
    paceKmh: row.paceKmh,
    durationMinutes: row.durationMinutes,
    difficulty: row.difficulty as Ride['difficulty'],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/**
 * Creates a minimal, valid draft `Ride` (CR-017, `.claude/context/current-task.md`) —
 * only `title`/`bicycleType`/`startsAt`/`startTimezone`; every other column stays
 * `null` until CR-018 ("Edit draft") fills it in.
 *
 * `userId` must come from the verified session only (`plugins/auth.ts`'s
 * `requireAuth`) — there is no client-supplied `organizerId`
 * (`.claude/rules/security.md`: never trust a client-supplied id). Resolved to the
 * caller's own `OrganizerProfile` here, the same "identity via a fresh DB read, not a
 * value passed in" discipline `organizers.service.ts` already uses for `emailVerified`.
 * 403s `organizer_profile_required` if the caller has none yet — this is NOT CR-016
 * ("Organizer authorization"): that ticket checks ownership of an *existing* ride on a
 * later mutation; this only establishes ownership at creation time.
 */
export async function createRide(
  db: DbClient,
  userId: string,
  input: CreateRideRequest,
): Promise<Ride> {
  const [organizerProfile] = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (!organizerProfile) {
    throw ORGANIZER_PROFILE_REQUIRED();
  }

  const [inserted] = await db
    .insert(rides)
    .values({
      organizerId: organizerProfile.id,
      title: input.title,
      bicycleType: input.bicycleType,
      startsAt: new Date(input.startsAt),
      startTimezone: input.startTimezone,
      updatedBy: userId,
    })
    .returning();
  if (!inserted) {
    throw new Error('Ride insert returned no row.');
  }
  return toPublicRide(inserted);
}
