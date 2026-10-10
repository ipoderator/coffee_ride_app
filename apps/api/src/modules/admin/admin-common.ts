import { sql, type SQL, type AnyColumn } from 'drizzle-orm';
import type { DbClient } from 'db';
import { adminActions } from 'db/schema';
import type { AdminActionType, AdminTargetType } from 'types';
import { CursorError, decodeCursor, encodeCursor } from '../../lib/cursor.js';

// CR-229 (ADR-032): pieces every `/v1/admin/*` service shares.

export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];

// Domain error the route layer maps to RFC 9457 — same shape as the other
// modules' `*ServiceError` (`error-handler.ts` reads `statusCode`/`code`/`title`).
export class AdminServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'AdminServiceError';
  }
}

const notFound = (what: string) => () =>
  new AdminServiceError(
    `${what}_not_found`,
    404,
    'Not Found',
    `No such ${what}.`,
  );
export const USER_NOT_FOUND = notFound('user');
export const RIDE_NOT_FOUND = notFound('ride');
export const REVIEW_NOT_FOUND = notFound('review');

/** A state change that is already in effect (`user_already_blocked`, …). */
export const conflict = (code: string, detail: string) =>
  new AdminServiceError(code, 409, 'Conflict', detail);

const INVALID_CURSOR = () =>
  new AdminServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Newest-first keyset condition `(createdAt, id) < cursor`. Validates the decoded
 * key before it reaches SQL — a forged cursor is a `400`, never a cast error 500.
 */
export function createdBeforeCursor(
  cursor: string | undefined,
  createdAt: AnyColumn,
  id: AnyColumn,
): SQL | undefined {
  if (!cursor) return undefined;
  let key;
  try {
    key = decodeCursor(cursor);
  } catch (error) {
    if (error instanceof CursorError) throw INVALID_CURSOR();
    throw error;
  }
  if (!UUID_PATTERN.test(key.id) || Number.isNaN(Date.parse(key.sortValue))) {
    throw INVALID_CURSOR();
  }
  return sql`(${createdAt}, ${id}) < (${key.sortValue}::timestamptz, ${key.id}::uuid)`;
}

/** Slices the `limit + 1` probe row off and builds the next cursor. */
export function toPage<Row extends { id: string; createdAt: Date }, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(map),
    nextCursor:
      hasMore && last
        ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

/** `ILIKE` pattern for a substring search, with the user's `%`/`_`/`\` escaped. */
export function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * ADR-032: the audit row every admin mutation writes, inside the same transaction
 * as the change it records. Never carries participant data — the target is named
 * by id only.
 */
export async function recordAdminAction(
  tx: Pick<DbClient, 'insert'>,
  entry: {
    adminUserId: string;
    action: AdminActionType;
    targetType: AdminTargetType;
    targetId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx
    .insert(adminActions)
    .values({ ...entry, reason: entry.reason ?? null });
}
