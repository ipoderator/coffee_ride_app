import { and, desc, eq, sql } from 'drizzle-orm';
import {
  notifications,
  organizerProfiles,
  registrations,
  rideUpdates,
  rides,
} from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateRideUpdateRequest,
  ListMyNotificationsResponse,
  ListRideUpdatesResponse,
  ListRidesQuery,
  Notification,
  RideUpdate,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `RegistrationServiceError`/`RideServiceError` (`.claude/rules/backend.md`).
export class NotificationServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'NotificationServiceError';
  }
}

// Same resource-enumeration-safe shape every other organizer-only endpoint uses
// (`registrations.service.ts`'s own `RIDE_NOT_FOUND`, not imported — each module
// owns its own domain-error factories).
const RIDE_NOT_FOUND = () =>
  new NotificationServiceError(
    'ride_not_found',
    404,
    'Ride not found',
    'No ride with that id exists for this account.',
  );

const INVALID_CURSOR = () =>
  new NotificationServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

const NOTIFICATION_NOT_FOUND = () =>
  new NotificationServiceError(
    'notification_not_found',
    404,
    'Notification not found',
    'No notification with that id exists for this account.',
  );

// Minimal handle a caller must be able to provide, not the full Fastify/pino
// type — same "define the small interface this module actually needs" pattern
// as `plugins/s3.ts`'s `S3Handle`. Lets the resilience-required "log, don't
// throw" step (see `createRegistrationConfirmedNotification`'s doc comment)
// happen without pulling a Fastify type into this service module.
export interface NotificationLogger {
  error: (obj: unknown, msg?: string) => void;
}

function toRideUpdate(row: typeof rideUpdates.$inferSelect): RideUpdate {
  return {
    id: row.id,
    rideId: row.rideId,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

function toNotification(row: {
  id: string;
  userId: string;
  type: Notification['type'];
  rideId: string;
  rideTitle: string;
  message: string | null;
  createdAt: Date;
  readAt: Date | null;
}): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    ride: { id: row.rideId, title: row.rideTitle },
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

/**
 * Same organizer-only ownership gate as `registrations.service.ts`'s
 * `assertOwnRide` — not imported (each module owns its own domain-error
 * factories, same reasoning documented there).
 */
async function assertOwnRide(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: rides.id })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(and(eq(rides.id, rideId), eq(organizerProfiles.userId, userId)))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }
}

/**
 * CR-038 ("Registration confirmation"): fires after `createRegistration`'s
 * transaction (or `cancelRegistration`'s waitlist-promotion branch) has already
 * committed — never inside it. `.claude/rules/resilience.md`: a non-critical side
 * effect must never be able to fail or roll back the critical action that
 * triggered it. A plain DB insert, not a Redis queue
 * (`.claude/context/current-task.md`'s scope decision — CR-050 is the ticket that
 * would change this). A failure here is logged and swallowed, never rethrown —
 * the caller's registration/promotion already succeeded and must stay that way.
 */
export async function createRegistrationConfirmedNotification(
  db: DbClient,
  logger: NotificationLogger,
  userId: string,
  rideId: string,
): Promise<void> {
  try {
    await db
      .insert(notifications)
      .values({ userId, rideId, type: 'registration_confirmed' });
  } catch (err) {
    logger.error(
      { err, userId, rideId },
      'Failed to create registration_confirmed notification',
    );
  }
}

/**
 * Shared fan-out helper for CR-039 ("Ride updates")/CR-040 ("Cancellation
 * notification"): notifies every currently-active registrant for a ride. Same
 * "registrations only, not waitlist" scope `listParticipants`/`listMyRegistrations`
 * already established (`.claude/context/current-task.md`). Zero active
 * registrants is a no-op, not an error — sending an update/cancelling a ride with
 * nobody registered yet is harmless. Same log-and-swallow discipline as
 * {@link createRegistrationConfirmedNotification} — a notification fan-out
 * failure must never fail the ride action that triggered it.
 */
async function notifyActiveRegistrants(
  db: DbClient,
  logger: NotificationLogger,
  rideId: string,
  type: 'ride_update' | 'ride_cancelled',
  rideUpdateId: string | null,
): Promise<void> {
  try {
    const activeRegistrants = await db
      .select({ userId: registrations.userId })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.status, 'active'),
        ),
      );
    if (activeRegistrants.length === 0) return;

    await db.insert(notifications).values(
      activeRegistrants.map((row) => ({
        userId: row.userId,
        rideId,
        rideUpdateId,
        type,
      })),
    );
  } catch (err) {
    logger.error(
      { err, rideId, type },
      'Failed to fan out notifications to active registrants',
    );
  }
}

/**
 * CR-040 ("Cancellation notification"): called after `cancelRide`
 * (`rides.service.ts`) has already committed the ride's `cancelled` status.
 * Exported (not folded into {@link notifyActiveRegistrants} directly) so
 * `rides.service.ts` has one clearly-named entry point, same shape as
 * {@link createRegistrationConfirmedNotification}.
 */
export async function notifyRideCancelled(
  db: DbClient,
  logger: NotificationLogger,
  rideId: string,
): Promise<void> {
  await notifyActiveRegistrants(db, logger, rideId, 'ride_cancelled', null);
}

/**
 * CR-039 ("Ride updates"): creates the `RideUpdate` row, then fans out a
 * `ride_update` notification to every active registrant. Organizer-only
 * (`assertOwnRide`) — `404 ride_not_found` for a non-existent ride or one that
 * isn't the caller's. No ride-status gate beyond ownership
 * (`.claude/context/current-task.md`: sending an update on a ride with no
 * registrants yet is harmless, not an error).
 */
export async function createRideUpdate(
  db: DbClient,
  logger: NotificationLogger,
  userId: string,
  rideId: string,
  input: CreateRideUpdateRequest,
): Promise<RideUpdate> {
  await assertOwnRide(db, userId, rideId);

  const [inserted] = await db
    .insert(rideUpdates)
    .values({ rideId, message: input.message, updatedBy: userId })
    .returning();
  if (!inserted) {
    throw new Error('Ride update insert returned no row.');
  }

  await notifyActiveRegistrants(db, logger, rideId, 'ride_update', inserted.id);

  return toRideUpdate(inserted);
}

/**
 * CR-039: an organizer's own ride's update history, newest first. Same
 * organizer-only gate as {@link createRideUpdate}, same cursor-pagination
 * machinery every other collection endpoint uses (ADR-011).
 */
export async function listRideUpdates(
  db: DbClient,
  userId: string,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideUpdatesResponse> {
  await assertOwnRide(db, userId, rideId);

  const limit = clampLimit(query.limit);
  const conditions = [eq(rideUpdates.rideId, rideId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      sql`(${rideUpdates.createdAt}, ${rideUpdates.id}) < (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(rideUpdates)
    .where(and(...conditions))
    .orderBy(desc(rideUpdates.createdAt), desc(rideUpdates.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toRideUpdate), nextCursor };
}

const notificationSelection = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  rideId: notifications.rideId,
  rideTitle: rides.title,
  message: rideUpdates.message,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
};

/**
 * CR-041 ("In-app notifications"): the caller's own notifications, newest first.
 * No filter dimension of its own (unlike `/registrations/mine`'s required
 * `when`) — a notification inbox has no natural upcoming/past split.
 */
export async function listMyNotifications(
  db: DbClient,
  userId: string,
  query: ListRidesQuery,
): Promise<ListMyNotificationsResponse> {
  const limit = clampLimit(query.limit);
  const conditions = [eq(notifications.userId, userId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select(notificationSelection)
    .from(notifications)
    .innerJoin(rides, eq(notifications.rideId, rides.id))
    .leftJoin(rideUpdates, eq(notifications.rideUpdateId, rideUpdates.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toNotification), nextCursor };
}

/**
 * CR-041: marks one of the caller's own notifications as read. `404
 * notification_not_found` if the id doesn't exist or belongs to someone else —
 * identity comes only from the verified session (`.claude/rules/security.md`).
 * Idempotent: re-marking an already-read notification keeps its original
 * `readAt` (via `coalesce`) rather than bumping the timestamp, so repeat calls
 * (e.g. a double click) don't lose the original read time.
 */
export async function markNotificationRead(
  db: DbClient,
  userId: string,
  notificationId: string,
): Promise<Notification> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    )
    .returning({ id: notifications.id });
  if (!updated) {
    throw NOTIFICATION_NOT_FOUND();
  }

  const [row] = await db
    .select(notificationSelection)
    .from(notifications)
    .innerJoin(rides, eq(notifications.rideId, rides.id))
    .leftJoin(rideUpdates, eq(notifications.rideUpdateId, rideUpdates.id))
    .where(eq(notifications.id, updated.id))
    .limit(1);
  if (!row) {
    throw new Error('Notification row not found after update.');
  }
  return toNotification(row);
}
