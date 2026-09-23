import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { registrations, rideGroups, rides, waitlistEntries } from 'db/schema';
import type { DbClient } from 'db';
import {
  RIDE_GROUP_MAX_PER_RIDE,
  type CreateRideGroupRequest,
  type ListRideGroupsResponse,
  type ListRidesQuery,
  type RideGroup,
  type RideGroupSummary,
  type UpdateRideGroupRequest,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';
import {
  RideServiceError,
  resolveOwnOrganizerProfileId,
} from './rides.service.js';

// CR-117 ("Pace groups", ADR-022). Its own file inside the `rides` capability module
// rather than more of `rides.service.ts` (already ~2100 lines): groups are ride
// configuration — same owner, same `RideServiceError`, same `/v1/rides/:id/...` URL
// space as stops/route points — but a self-contained slice of it.

type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

// Unlike stops/route points (draft-only, `resolveOwnDraftRide`), groups stay
// editable after publishing: organizers split or rename groups once they see who
// signed up. Only a finished or cancelled ride is frozen.
const RIDE_GROUP_EDITABLE_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'started',
] as const;

// Same resource-enumeration-safe shape as `rides.service.ts`'s own `RIDE_NOT_FOUND`
// (not exported from there — each file keeps its factories next to their use).
const RIDE_NOT_FOUND = () =>
  new RideServiceError(
    'ride_not_found',
    404,
    'Ride not found',
    'No ride with that id exists for this account.',
  );

const RIDE_GROUPS_NOT_EDITABLE = () =>
  new RideServiceError(
    'ride_groups_not_editable',
    409,
    'Ride groups are not editable',
    'Groups cannot be changed once a ride is finished or cancelled.',
  );

// Covers both "no such group" and "group belongs to a different ride", same shape
// as `STOP_NOT_FOUND`.
const GROUP_NOT_FOUND = () =>
  new RideServiceError(
    'group_not_found',
    404,
    'Group not found',
    'No group with that id exists for this ride.',
  );

const GROUP_LIMIT_REACHED = () =>
  new RideServiceError(
    'group_limit_reached',
    409,
    'Group limit reached',
    `A ride can have at most ${RIDE_GROUP_MAX_PER_RIDE} groups.`,
  );

const GROUP_NAME_TAKEN = () =>
  new RideServiceError(
    'group_name_taken',
    409,
    'Group name already used',
    'This ride already has a group with that name.',
  );

const GROUP_HAS_REGISTRATIONS = () =>
  new RideServiceError(
    'group_has_registrations',
    409,
    'Group has registrations',
    'Participants are registered (or waitlisted) in this group. Move them to another group first.',
  );

const INVALID_CURSOR = () =>
  new RideServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export function toRideGroup(row: typeof rideGroups.$inferSelect): RideGroup {
  return {
    id: row.id,
    rideId: row.rideId,
    name: row.name,
    paceKmh: row.paceKmh,
    description: row.description,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/** Active-registration count per group of one ride (groups with none are absent). */
async function countActiveRegistrationsByGroup(
  db: DbClient,
  rideId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      groupId: registrations.groupId,
      count: sql<number>`count(*)::int`,
    })
    .from(registrations)
    .where(
      and(
        eq(registrations.rideId, rideId),
        eq(registrations.status, 'active'),
        isNotNull(registrations.groupId),
      ),
    )
    .groupBy(registrations.groupId);
  return new Map(rows.map((row) => [row.groupId!, row.count]));
}

/**
 * Ownership gate + row lock for every group mutation: the caller's own ride, locked
 * `FOR UPDATE` — the same row `registrations.service.ts` locks for register/
 * waitlist/cancel, so a group delete can never interleave with a registration into
 * that group, and two concurrent creates can't both pass the max-6 check.
 */
async function lockOwnEditableRide(
  tx: DbTransaction,
  organizerProfileId: string,
  rideId: string,
): Promise<void> {
  const [ride] = await tx
    .select({ status: rides.status })
    .from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.organizerId, organizerProfileId)))
    .for('update')
    .limit(1);
  if (!ride) {
    throw RIDE_NOT_FOUND();
  }
  if (
    !(RIDE_GROUP_EDITABLE_STATUSES as readonly string[]).includes(ride.status)
  ) {
    throw RIDE_GROUPS_NOT_EDITABLE();
  }
}

async function requireOrganizerProfileId(
  db: DbClient,
  userId: string,
): Promise<string> {
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    throw RIDE_NOT_FOUND();
  }
  return organizerProfileId;
}

/**
 * Rewrites a ride's group positions to `0..n-1` in the given order. Two phases
 * because `ride_groups_ride_id_position_unique` is checked row by row: first every
 * group of the ride moves out of the `0..n-1` range in one statement (`+ 1000` —
 * positions are always dense and < `RIDE_GROUP_MAX_PER_RIDE`, so the shifted values
 * can't collide with anything), then each takes its final slot.
 */
async function writeGroupPositions(
  tx: DbTransaction,
  rideId: string,
  orderedIds: string[],
): Promise<void> {
  await tx
    .update(rideGroups)
    .set({ position: sql`${rideGroups.position} + 1000` })
    .where(eq(rideGroups.rideId, rideId));
  for (const [position, id] of orderedIds.entries()) {
    await tx.update(rideGroups).set({ position }).where(eq(rideGroups.id, id));
  }
}

function assertNameFree(
  groups: Array<{ id: string; name: string }>,
  name: string,
  exceptId: string | null,
): void {
  const lowered = name.toLowerCase();
  if (
    groups.some(
      (group) => group.id !== exceptId && group.name.toLowerCase() === lowered,
    )
  ) {
    throw GROUP_NAME_TAKEN();
  }
}

/**
 * CR-117: `GET /v1/rides/:id/groups` — organizer-only, at any ride status (reading
 * a finished ride's groups is harmless). Ordered by `position`; each item carries its
 * live active-registration count. Paginated per ADR-011 even though a ride has at
 * most {@link RIDE_GROUP_MAX_PER_RIDE} groups — a collection endpoint without
 * pagination is a contract bug (`.claude/rules/backend.md`).
 */
export async function listRideGroups(
  db: DbClient,
  userId: string,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideGroupsResponse> {
  const organizerProfileId = await requireOrganizerProfileId(db, userId);
  const [ride] = await db
    .select({ id: rides.id })
    .from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.organizerId, organizerProfileId)))
    .limit(1);
  if (!ride) {
    throw RIDE_NOT_FOUND();
  }

  const limit = clampLimit(query.limit);
  const conditions = [eq(rideGroups.rideId, rideId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    const position = Number(cursorKey.sortValue);
    if (!Number.isInteger(position)) throw INVALID_CURSOR();
    conditions.push(sql`${rideGroups.position} > ${position}`);
  }

  const rows = await db
    .select()
    .from(rideGroups)
    .where(and(...conditions))
    .orderBy(asc(rideGroups.position))
    .limit(limit + 1);
  const counts = await countActiveRegistrationsByGroup(db, rideId);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      ...toRideGroup(row),
      registrationsCount: counts.get(row.id) ?? 0,
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({ sortValue: String(last.position), id: last.id })
        : null,
  };
}

/**
 * CR-117: adds a group at the end (`position` = current count). `409
 * group_limit_reached` past {@link RIDE_GROUP_MAX_PER_RIDE}, `409 group_name_taken`
 * for a case-insensitive duplicate name within the ride (the
 * `ride_groups_ride_id_name_unique` index is the backstop, mapped to the same code).
 */
export async function createRideGroup(
  db: DbClient,
  userId: string,
  rideId: string,
  input: CreateRideGroupRequest,
): Promise<RideGroup> {
  const organizerProfileId = await requireOrganizerProfileId(db, userId);

  try {
    return await db.transaction(async (tx) => {
      await lockOwnEditableRide(tx, organizerProfileId, rideId);

      const existing = await tx
        .select({ id: rideGroups.id, name: rideGroups.name })
        .from(rideGroups)
        .where(eq(rideGroups.rideId, rideId));
      if (existing.length >= RIDE_GROUP_MAX_PER_RIDE) {
        throw GROUP_LIMIT_REACHED();
      }
      assertNameFree(existing, input.name, null);

      const [inserted] = await tx
        .insert(rideGroups)
        .values({
          rideId,
          name: input.name,
          paceKmh: input.paceKmh,
          description: input.description ?? null,
          position: existing.length,
          updatedBy: userId,
        })
        .returning();
      if (!inserted) {
        throw new Error('Ride group insert returned no row.');
      }
      return toRideGroup(inserted);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw GROUP_NAME_TAKEN();
    throw error;
  }
}

/**
 * CR-117: any subset of `name`/`paceKmh`/`description`/`position` (same PATCH
 * semantics as `updateStop`: `undefined` = omit, `null` description = clear).
 * `position` moves the group to that slot and shifts the others along — clamped to
 * the last slot, so "move to end" is simply a large value.
 */
export async function updateRideGroup(
  db: DbClient,
  userId: string,
  rideId: string,
  groupId: string,
  patch: UpdateRideGroupRequest,
): Promise<RideGroup> {
  const organizerProfileId = await requireOrganizerProfileId(db, userId);

  try {
    return await db.transaction(async (tx) => {
      await lockOwnEditableRide(tx, organizerProfileId, rideId);

      const groups = await tx
        .select({ id: rideGroups.id, name: rideGroups.name })
        .from(rideGroups)
        .where(eq(rideGroups.rideId, rideId))
        .orderBy(asc(rideGroups.position));
      const currentIndex = groups.findIndex((group) => group.id === groupId);
      if (currentIndex === -1) {
        throw GROUP_NOT_FOUND();
      }
      if (patch.name !== undefined) {
        assertNameFree(groups, patch.name, groupId);
      }

      if (patch.position !== undefined) {
        const target = Math.min(patch.position, groups.length - 1);
        if (target !== currentIndex) {
          const ordered = groups.map((group) => group.id);
          ordered.splice(currentIndex, 1);
          ordered.splice(target, 0, groupId);
          await writeGroupPositions(tx, rideId, ordered);
        }
      }

      const values: Partial<typeof rideGroups.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: userId,
      };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.paceKmh !== undefined) values.paceKmh = patch.paceKmh;
      if (patch.description !== undefined)
        values.description = patch.description;

      const [updated] = await tx
        .update(rideGroups)
        .set(values)
        .where(and(eq(rideGroups.id, groupId), eq(rideGroups.rideId, rideId)))
        .returning();
      if (!updated) {
        throw GROUP_NOT_FOUND();
      }
      return toRideGroup(updated);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw GROUP_NAME_TAKEN();
    throw error;
  }
}

/**
 * CR-117: removes a group. `409 group_has_registrations` while any *active*
 * registration or *waiting* waitlist entry points at it — the organizer (or the
 * participants themselves, `PATCH .../register`) must move them first; silently
 * dropping someone's group choice would be data loss. Historical rows (cancelled
 * registrations, promoted/cancelled waitlist entries) lose their `groupId` instead —
 * they would otherwise block the delete through the composite FK for no product
 * reason. Remaining groups are renumbered to stay dense.
 */
export async function deleteRideGroup(
  db: DbClient,
  userId: string,
  rideId: string,
  groupId: string,
): Promise<void> {
  const organizerProfileId = await requireOrganizerProfileId(db, userId);

  await db.transaction(async (tx) => {
    await lockOwnEditableRide(tx, organizerProfileId, rideId);

    const groups = await tx
      .select({ id: rideGroups.id })
      .from(rideGroups)
      .where(eq(rideGroups.rideId, rideId))
      .orderBy(asc(rideGroups.position));
    if (!groups.some((group) => group.id === groupId)) {
      throw GROUP_NOT_FOUND();
    }

    const [activeRegistration] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.groupId, groupId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    const [waitingEntry] = await tx
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.rideId, rideId),
          eq(waitlistEntries.groupId, groupId),
          eq(waitlistEntries.status, 'waiting'),
        ),
      )
      .limit(1);
    if (activeRegistration || waitingEntry) {
      throw GROUP_HAS_REGISTRATIONS();
    }

    await tx
      .update(registrations)
      .set({ groupId: null })
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.groupId, groupId),
          ne(registrations.status, 'active'),
        ),
      );
    await tx
      .update(waitlistEntries)
      .set({ groupId: null })
      .where(
        and(
          eq(waitlistEntries.rideId, rideId),
          eq(waitlistEntries.groupId, groupId),
          ne(waitlistEntries.status, 'waiting'),
        ),
      );
    await tx
      .delete(rideGroups)
      .where(and(eq(rideGroups.id, groupId), eq(rideGroups.rideId, rideId)));

    const remaining = groups
      .map((group) => group.id)
      .filter((id) => id !== groupId);
    await writeGroupPositions(tx, rideId, remaining);
  });
}

/**
 * CR-117: `GET /v1/rides/:id`'s public `groups[]` — no visibility check of its own,
 * `getRideForViewer` has already resolved it by the time this runs.
 */
export async function listRideGroupSummaries(
  db: DbClient,
  rideId: string,
): Promise<RideGroupSummary[]> {
  const rows = await db
    .select()
    .from(rideGroups)
    .where(eq(rideGroups.rideId, rideId))
    .orderBy(asc(rideGroups.position));
  if (rows.length === 0) {
    return [];
  }
  const counts = await countActiveRegistrationsByGroup(db, rideId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    paceKmh: row.paceKmh,
    description: row.description,
    position: row.position,
    registrationsCount: counts.get(row.id) ?? 0,
  }));
}

/**
 * CR-116: every group of every ride on a discovery page, name + pace only, in one
 * query (never one per ride).
 */
export async function listRideGroupNamesByRideIds(
  db: DbClient,
  rideIds: string[],
): Promise<Map<string, Array<{ name: string; paceKmh: number }>>> {
  const byRide = new Map<string, Array<{ name: string; paceKmh: number }>>();
  if (rideIds.length === 0) {
    return byRide;
  }
  const rows = await db
    .select({
      rideId: rideGroups.rideId,
      name: rideGroups.name,
      paceKmh: rideGroups.paceKmh,
    })
    .from(rideGroups)
    .where(inArray(rideGroups.rideId, rideIds))
    .orderBy(asc(rideGroups.rideId), asc(rideGroups.position));
  for (const row of rows) {
    const list = byRide.get(row.rideId) ?? [];
    list.push({ name: row.name, paceKmh: row.paceKmh });
    byRide.set(row.rideId, list);
  }
  return byRide;
}
