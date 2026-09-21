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
import type { EmailProvider } from '../../lib/email/email-provider.js';

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

// CR-050 ("Async notification delivery via Redis queue"): the job vocabulary the
// BullMQ queue/worker in `./queue.ts` speaks. Defined here, not there, so this
// module (which owns the actual insert logic the worker calls back into) has no
// dependency on the queue module — `queue.ts` imports these types plus
// {@link processNotificationJob} from here, never the reverse.
export type NotificationJobName =
  | 'registration_confirmed'
  | 'ride_update'
  | 'ride_cancelled'
  | 'verification_email'
  | 'password_reset_email';

export interface RegistrationConfirmedJobData {
  userId: string;
  rideId: string;
}

export interface RideUpdateJobData {
  rideId: string;
  rideUpdateId: string;
}

export interface RideCancelledJobData {
  rideId: string;
}

// CR-100 (ADR-007): the raw, single-use token is embedded in the URL at
// issuance time (the DB only ever stores its hash — `auth.service.ts`'s
// `hashToken`) — there is no other point after this where it could be
// recovered to build the link, so it must travel through the job payload.
export interface VerificationEmailJobData {
  email: string;
  verifyUrl: string;
}

export interface PasswordResetEmailJobData {
  email: string;
  resetUrl: string;
}

export type NotificationJobData =
  | RegistrationConfirmedJobData
  | RideUpdateJobData
  | RideCancelledJobData
  | VerificationEmailJobData
  | PasswordResetEmailJobData;

// Minimal handle every producer below needs — same "define the small interface
// this module actually needs" pattern as {@link NotificationLogger}/`S3Handle`
// (`plugins/s3.ts`). `null` when `REDIS_URL` isn't configured (`queue.ts`'s
// `registerNotificationQueue`), same "not configured is a degraded mode" shape as
// `app.s3` — every producer below falls back to today's direct synchronous insert
// in that case, so this module works identically with or without Redis.
export interface NotificationQueue {
  add(name: NotificationJobName, data: NotificationJobData): Promise<void>;
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

// Raw insert, no try/catch: used both by the queue-worker's job processor (where a
// thrown error is exactly what should happen — it drives BullMQ's own bounded
// retry) and directly by the producer below when no queue is configured.
async function insertRegistrationConfirmedNotification(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  await db
    .insert(notifications)
    .values({ userId, rideId, type: 'registration_confirmed' });
}

/**
 * CR-038 ("Registration confirmation"): fires after `createRegistration`'s
 * transaction (or `cancelRegistration`'s waitlist-promotion branch) has already
 * committed — never inside it. `.claude/rules/resilience.md`: a non-critical side
 * effect must never be able to fail or roll back the critical action that
 * triggered it.
 *
 * CR-050: if a queue is configured (`REDIS_URL` set), enqueues and returns —
 * the actual insert happens in the worker, outside this request entirely. If
 * not (this environment — KI-014), falls back to the same direct synchronous
 * insert this function always did before CR-050, so behavior (and every
 * existing test) is unchanged with no Redis present. Either way, a failure
 * here is logged and swallowed, never rethrown — the caller's
 * registration/promotion already succeeded and must stay that way.
 */
export async function createRegistrationConfirmedNotification(
  db: DbClient,
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  userId: string,
  rideId: string,
): Promise<void> {
  try {
    if (queue) {
      await queue.add('registration_confirmed', { userId, rideId });
    } else {
      await insertRegistrationConfirmedNotification(db, userId, rideId);
    }
  } catch (err) {
    logger.error(
      { err, userId, rideId },
      'Failed to create registration_confirmed notification',
    );
  }
}

// Raw fan-out insert, no try/catch — same {@link insertRegistrationConfirmedNotification}
// split: shared by the worker's job processor and the no-queue-configured
// fallback path. Zero active registrants is a no-op, not an error — sending an
// update/cancelling a ride with nobody registered yet is harmless.
async function insertActiveRegistrantNotifications(
  db: DbClient,
  rideId: string,
  type: 'ride_update' | 'ride_cancelled',
  rideUpdateId: string | null,
): Promise<void> {
  const activeRegistrants = await db
    .select({ userId: registrations.userId })
    .from(registrations)
    .where(
      and(eq(registrations.rideId, rideId), eq(registrations.status, 'active')),
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
}

/**
 * Shared fan-out producer for CR-039 ("Ride updates")/CR-040 ("Cancellation
 * notification"): notifies every currently-active registrant for a ride. Same
 * "registrations only, not waitlist" scope `listParticipants`/`listMyRegistrations`
 * already established (`.claude/context/current-task.md`). Same CR-050
 * enqueue-or-fall-back-to-direct-insert shape as
 * {@link createRegistrationConfirmedNotification} — see its doc comment. Same
 * log-and-swallow discipline either way — a notification fan-out failure must
 * never fail the ride action that triggered it.
 */
async function notifyActiveRegistrants(
  db: DbClient,
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  rideId: string,
  type: 'ride_update' | 'ride_cancelled',
  rideUpdateId: string | null,
): Promise<void> {
  try {
    if (queue) {
      if (type === 'ride_update') {
        await queue.add('ride_update', { rideId, rideUpdateId: rideUpdateId! });
      } else {
        await queue.add('ride_cancelled', { rideId });
      }
    } else {
      await insertActiveRegistrantNotifications(db, rideId, type, rideUpdateId);
    }
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
  queue: NotificationQueue | null,
  rideId: string,
): Promise<void> {
  await notifyActiveRegistrants(
    db,
    logger,
    queue,
    rideId,
    'ride_cancelled',
    null,
  );
}

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function verificationEmailContent(verifyUrl: string): EmailContent {
  return {
    subject: 'Подтвердите email — Coffee Ride',
    text: `Чтобы подтвердить email и активировать аккаунт, перейдите по ссылке:\n${verifyUrl}\n\nЕсли вы не регистрировались на Coffee Ride, просто проигнорируйте это письмо.`,
    html: `<p>Чтобы подтвердить email и активировать аккаунт, перейдите по ссылке:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Если вы не регистрировались на Coffee Ride, просто проигнорируйте это письмо.</p>`,
  };
}

function passwordResetEmailContent(resetUrl: string): EmailContent {
  return {
    subject: 'Восстановление пароля — Coffee Ride',
    text: `Чтобы задать новый пароль, перейдите по ссылке (действует 30 минут):\n${resetUrl}\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    html: `<p>Чтобы задать новый пароль, перейдите по ссылке (действует 30 минут):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>`,
  };
}

// Raw send, no try/catch — same split as `insertRegistrationConfirmedNotification`:
// shared by the worker's job processor and the no-queue-configured fallback path.
// `emailProvider: null` (Unisender not configured, ADR-007/CR-100) is a silent
// no-op, not an error — the dev-only token already reaches whoever needs it via
// the API response (`auth.routes.ts`), same as before this ticket.
async function sendEmail(
  emailProvider: EmailProvider | null,
  to: string,
  content: EmailContent,
): Promise<void> {
  if (!emailProvider) return;
  await emailProvider.send({ to, ...content });
}

/**
 * CR-100 (ADR-007): fires after `registerUser`'s insert has already
 * committed — never inside it, same "critical action must not depend on a
 * non-critical side effect" split as {@link createRegistrationConfirmedNotification}.
 * `.claude/rules/security.md`: never logs the token (embedded in `verifyUrl`)
 * or the recipient's email address — the error log carries only `{ err }`.
 */
export async function sendVerificationEmail(
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  emailProvider: EmailProvider | null,
  email: string,
  verifyUrl: string,
): Promise<void> {
  try {
    if (queue) {
      await queue.add('verification_email', { email, verifyUrl });
    } else {
      await sendEmail(
        emailProvider,
        email,
        verificationEmailContent(verifyUrl),
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send verification email');
  }
}

/**
 * CR-100 (ADR-007): fires after `requestPasswordReset` has already
 * committed the new token row. Called only when `requestPasswordReset`
 * reports `userFound: true` — `.claude/rules/security.md`'s no-enumeration
 * requirement is enforced by the route's response staying identical either
 * way (always `204`), not by anything in this function.
 */
export async function sendPasswordResetEmail(
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  emailProvider: EmailProvider | null,
  email: string,
  resetUrl: string,
): Promise<void> {
  try {
    if (queue) {
      await queue.add('password_reset_email', { email, resetUrl });
    } else {
      await sendEmail(
        emailProvider,
        email,
        passwordResetEmailContent(resetUrl),
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
  }
}

/**
 * CR-050: dispatches a job the worker in `./queue.ts` pulled off the
 * `notifications` BullMQ queue to the matching raw insert function. Throws on
 * failure (deliberately, unlike every producer above) — BullMQ's own bounded
 * retry/backoff is what should react to that, and a failure surviving every
 * retry attempt is logged by the worker's own `failed` handler
 * (`.claude/rules/resilience.md`: a background job failure must never silently
 * disappear).
 */
export async function processNotificationJob(
  db: DbClient,
  emailProvider: EmailProvider | null,
  name: NotificationJobName,
  data: NotificationJobData,
): Promise<void> {
  switch (name) {
    case 'registration_confirmed': {
      const { userId, rideId } = data as RegistrationConfirmedJobData;
      await insertRegistrationConfirmedNotification(db, userId, rideId);
      return;
    }
    case 'ride_update': {
      const { rideId, rideUpdateId } = data as RideUpdateJobData;
      await insertActiveRegistrantNotifications(
        db,
        rideId,
        'ride_update',
        rideUpdateId,
      );
      return;
    }
    case 'ride_cancelled': {
      const { rideId } = data as RideCancelledJobData;
      await insertActiveRegistrantNotifications(
        db,
        rideId,
        'ride_cancelled',
        null,
      );
      return;
    }
    case 'verification_email': {
      const { email, verifyUrl } = data as VerificationEmailJobData;
      await sendEmail(
        emailProvider,
        email,
        verificationEmailContent(verifyUrl),
      );
      return;
    }
    case 'password_reset_email': {
      const { email, resetUrl } = data as PasswordResetEmailJobData;
      await sendEmail(
        emailProvider,
        email,
        passwordResetEmailContent(resetUrl),
      );
      return;
    }
  }
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
  queue: NotificationQueue | null,
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

  await notifyActiveRegistrants(
    db,
    logger,
    queue,
    rideId,
    'ride_update',
    inserted.id,
  );

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
