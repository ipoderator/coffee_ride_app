import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { registrations, reviews, rides, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateReviewRequest,
  ListRideReviewsResponse,
  ListRidesQuery,
  Review,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `RegistrationServiceError`/`NotificationServiceError` (`.claude/rules/backend.md`).
export class ReviewServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'ReviewServiceError';
  }
}

const RIDE_NOT_FOUND = () =>
  new ReviewServiceError(
    'ride_not_found',
    404,
    'Ride not found',
    'No ride with that id exists.',
  );

const RIDE_NOT_FINISHED = () =>
  new ReviewServiceError(
    'ride_not_finished',
    409,
    'Ride is not finished',
    'You can only review a ride after it has finished.',
  );

const NOT_A_PARTICIPANT = () =>
  new ReviewServiceError(
    'not_a_participant',
    403,
    'Not a participant',
    'You must have an active registration for this ride to review it.',
  );

const REVIEW_ALREADY_EXISTS = () =>
  new ReviewServiceError(
    'review_already_exists',
    409,
    'Review already exists',
    'You have already reviewed this ride.',
  );

const INVALID_CURSOR = () =>
  new ReviewServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

// Exported for `rides.service.ts`'s `getRideForViewer` (`viewerReview`) — same
// cross-module reuse precedent as this file's own use of `rides.service.ts`'s
// `toPublicRide`.
export function toReview(row: {
  id: string;
  rideId: string;
  userId: string;
  authorName: string | null;
  rating: number;
  comment: string | null;
  createdAt: Date;
}): Review {
  return {
    id: row.id,
    rideId: row.rideId,
    userId: row.userId,
    authorName: row.authorName,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

/**
 * CR-042 ("Review"): a participant reviews a `finished` ride they actively attended.
 * `.claude/context/current-task.md`'s scope decision: eligibility is "active
 * registration" only — a cancelled registrant cannot review (same "active only" scope
 * `listParticipants`/`listMyRegistrations` already established), and only once the
 * ride's own status is `finished` (never client-supplied — resolved fresh from the
 * DB). One review per (ride, user); the unique index
 * (`packages/db/src/schema/review.ts`) is the real guard, this pre-check just avoids a
 * DB round trip failing in the common case.
 */
export async function createReview(
  db: DbClient,
  userId: string,
  rideId: string,
  input: CreateReviewRequest,
): Promise<Review> {
  const [rideRow] = await db
    .select({ status: rides.status })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!rideRow) {
    throw RIDE_NOT_FOUND();
  }
  if (rideRow.status !== 'finished') {
    throw RIDE_NOT_FINISHED();
  }

  const [registrationRow] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.rideId, rideId),
        eq(registrations.userId, userId),
        eq(registrations.status, 'active'),
      ),
    )
    .limit(1);
  if (!registrationRow) {
    throw NOT_A_PARTICIPANT();
  }

  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.rideId, rideId), eq(reviews.userId, userId)))
    .limit(1);
  if (existing) {
    throw REVIEW_ALREADY_EXISTS();
  }

  try {
    const [inserted] = await db
      .insert(reviews)
      .values({
        rideId,
        userId,
        rating: input.rating,
        comment: input.comment ?? null,
      })
      .returning();
    if (!inserted) {
      throw new Error('Review insert returned no row.');
    }

    const [authorRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return toReview({
      ...inserted,
      authorName: authorRow?.displayName ?? null,
    });
  } catch (error) {
    // Race: two concurrent submissions for the same (ride, user) both pass the
    // pre-check above — the table's unique index is the real guard, same
    // `isUniqueViolation` reasoning `organizers.service.ts`'s `createOrganizerProfile`
    // already documents.
    if (isUniqueViolation(error)) {
      throw REVIEW_ALREADY_EXISTS();
    }
    throw error;
  }
}

/**
 * CR-042: a ride's reviews, public (no session required — `docs/api.md`'s existing
 * "complete ride record, not a link out" reasoning), newest first. `404
 * ride_not_found` only for a genuinely nonexistent id — no draft-visibility check
 * beyond that, since a review can only ever exist on a `finished` ride
 * ({@link createReview}), so listing a draft/non-finished ride's reviews is simply
 * always empty, never a reason to 404.
 */
export async function listRideReviews(
  db: DbClient,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideReviewsResponse> {
  const [rideRow] = await db
    .select({ id: rides.id })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!rideRow) {
    throw RIDE_NOT_FOUND();
  }

  const limit = clampLimit(query.limit);
  const conditions = [eq(reviews.rideId, rideId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      sql`(${reviews.createdAt}, ${reviews.id}) < (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: reviews.id,
      rideId: reviews.rideId,
      userId: reviews.userId,
      authorName: users.displayName,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toReview), nextCursor };
}

export interface OrganizerRatingSummary {
  rating: number | null;
  reviewCount: number;
}

/**
 * CR-043 ("Organizer rating summary"): average rating + review count across every
 * review left on any of this organizer's rides (any status — a review can only exist
 * on a ride that already reached `finished`, so no extra status filter is needed
 * here). One aggregate query, reused by every single-organizer call site
 * (`organizers.service.ts`'s three `/me` endpoints, `rides.service.ts`'s
 * `getRideForViewer`) — same cross-module reuse precedent as `rides.service.ts`'s
 * exported `toPublicRide`. A page of *many* organizers (`listPublicRides`/
 * `listMyRegistrations`) uses {@link getOrganizerRatingSummaries} instead, to avoid
 * one query per row.
 */
export async function getOrganizerRatingSummary(
  db: DbClient,
  organizerProfileId: string,
): Promise<OrganizerRatingSummary> {
  const [row] = await db
    .select({
      rating: sql<number | null>`avg(${reviews.rating})::float`,
      reviewCount: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .innerJoin(rides, eq(reviews.rideId, rides.id))
    .where(eq(rides.organizerId, organizerProfileId));

  const reviewCount = row?.reviewCount ?? 0;
  return {
    rating: reviewCount > 0 ? (row?.rating ?? null) : null,
    reviewCount,
  };
}

/**
 * Batched counterpart to {@link getOrganizerRatingSummary}: one `group by` query for
 * every organizer id on a page of results, instead of N. Used by `rides.service.ts`'s
 * `listPublicRides` and `registrations.service.ts`'s `listMyRegistrations` — both
 * unauthenticated-or-high-traffic collection endpoints where an N+1 aggregate would
 * scale with page size. An organizer id absent from the returned map has zero
 * reviews — callers default to `{ rating: null, reviewCount: 0 }`.
 */
export async function getOrganizerRatingSummaries(
  db: DbClient,
  organizerProfileIds: readonly string[],
): Promise<Map<string, OrganizerRatingSummary>> {
  const summaries = new Map<string, OrganizerRatingSummary>();
  const uniqueIds = [...new Set(organizerProfileIds)];
  if (uniqueIds.length === 0) return summaries;

  const rows = await db
    .select({
      organizerId: rides.organizerId,
      rating: sql<number | null>`avg(${reviews.rating})::float`,
      reviewCount: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .innerJoin(rides, eq(reviews.rideId, rides.id))
    .where(inArray(rides.organizerId, uniqueIds))
    .groupBy(rides.organizerId);

  for (const row of rows) {
    summaries.set(row.organizerId, {
      rating: row.reviewCount > 0 ? row.rating : null,
      reviewCount: row.reviewCount,
    });
  }
  return summaries;
}
