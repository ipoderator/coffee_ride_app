import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sessions, users } from 'db/schema';
import type { DbClient } from 'db';

// CR-012 (`docs/decisions.md` ADR-013). Same token shape as email-verification
// tokens (`./tokens.ts`) — opaque random value handed to the caller once (the
// cookie), only its SHA-256 hash persisted — kept as its own pair of functions
// rather than imported from `tokens.ts` so this module stays self-contained
// (mirrors the existing `password.ts`/`tokens.ts` split: each auth primitive
// owns its own crypto helpers).
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// ADR-013: "extended at most once per day, not on every request." A session
// used again after this much time since its last use gets its expiry pushed
// out; used again sooner, it doesn't — no DB write at all on that path.
export const SESSION_ROLLING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Creates a session row for a just-authenticated user. Caller (the route
 * handler) sets the cookie from the returned raw `token` — never persisted.
 */
export async function createSession(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
    lastUsedAt: now,
  });

  return { token, expiresAt };
}

export interface ValidatedSession {
  sessionId: string;
  user: typeof users.$inferSelect;
}

/**
 * Looks up a session by its raw cookie token and, if valid, applies rolling
 * expiry (at most once per `SESSION_ROLLING_THRESHOLD_MS`). Returns `null` for
 * anything that isn't a currently-usable session: unknown token, expired,
 * or revoked (`revokedAt` isn't set by any CR-012 code path yet, but is
 * checked here so a future block/logout-everywhere feature takes effect with
 * no change to this function — ADR-013's fixed column, checked defensively).
 *
 * `now` is an explicit parameter (default `new Date()`) so rolling-expiry
 * behavior is unit-testable without a real 24h wait
 * (`.claude/context/current-task.md` acceptance criteria).
 */
export async function validateSession(
  db: DbClient,
  rawToken: string,
  now: Date = new Date(),
): Promise<ValidatedSession | null> {
  const tokenHash = hashSessionToken(rawToken);

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.session.revokedAt) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) return null;

  if (
    now.getTime() - row.session.lastUsedAt.getTime() >
    SESSION_ROLLING_THRESHOLD_MS
  ) {
    await db
      .update(sessions)
      .set({
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        lastUsedAt: now,
      })
      .where(eq(sessions.id, row.session.id));
  }

  return { sessionId: row.session.id, user: row.user };
}

/**
 * Hard-deletes the session row (ADR-013 §1: logout deletes the row, it is not
 * a `revokedAt` soft-delete). Returns whether a row was actually deleted, so
 * the route can tell "no such session" apart from "deleted" if it ever needs
 * to — currently both are treated the same (idempotent 204/401 per the route).
 */
export async function revokeSession(
  db: DbClient,
  rawToken: string,
): Promise<boolean> {
  const tokenHash = hashSessionToken(rawToken);
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id });
  return deleted.length > 0;
}
