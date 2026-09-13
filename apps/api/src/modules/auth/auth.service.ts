import { eq } from 'drizzle-orm';
import { emailVerificationTokens, users } from 'db/schema';
import type { DbClient } from 'db';
import type { User } from 'types';
import { hashPassword } from './password.js';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  generateVerificationToken,
  hashToken,
} from './tokens.js';

// Domain error the route layer maps to RFC 9457 — keeps `auth.routes.ts` thin
// (`.claude/rules/backend.md`: route -> validation -> service -> repository).
export class AuthServiceError extends Error {
  constructor(
    public readonly code: string,
    // Named to match `FastifyError`'s own field (`error-handler.ts` reads
    // `error.statusCode`) so throwing this from a route needs no translation.
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'AuthServiceError';
  }
}

function toPublicUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RegisterResult {
  user: User;
  // Raw token, never persisted — the route layer decides whether/how to expose
  // it (dev-only response field, per this ticket's scope boundaries).
  verificationToken: string;
}

/**
 * Creates a user + its first email-verification token in one transaction
 * (`.claude/rules/database.md`). Duplicate email is the one invariant this
 * endpoint protects; there is no capacity/concurrency race here the way
 * registration-for-a-ride has, so a single uniqueness check + the table's own
 * unique index (belt and suspenders against a race between the two) is enough.
 */
export async function registerUser(
  db: DbClient,
  email: string,
  password: string,
): Promise<RegisterResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (existing.length > 0) {
    throw new AuthServiceError(
      'email_already_registered',
      409,
      'Email already registered',
      'An account with this email already exists.',
    );
  }

  const passwordHash = await hashPassword(password);
  const rawToken = generateVerificationToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

  try {
    const user = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(users)
        .values({ email: normalizedEmail, passwordHash })
        .returning();
      if (!inserted) {
        throw new Error('User insert returned no row.');
      }

      await tx.insert(emailVerificationTokens).values({
        userId: inserted.id,
        tokenHash,
        expiresAt,
      });

      return inserted;
    });

    return { user: toPublicUser(user), verificationToken: rawToken };
  } catch (error) {
    // Race: two concurrent registrations for the same email both pass the
    // pre-check above. The table's unique index (`users_email_unique`) is the
    // real guard; surface it as the same domain error rather than a raw
    // constraint-violation message (`.claude/rules/backend.md`: never leak
    // driver internals).
    if (isUniqueViolation(error)) {
      throw new AuthServiceError(
        'email_already_registered',
        409,
        'Email already registered',
        'An account with this email already exists.',
      );
    }
    throw error;
  }
}

export async function verifyEmail(
  db: DbClient,
  rawToken: string,
): Promise<User> {
  const tokenHash = hashToken(rawToken);

  const [tokenRow] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) {
    throw new AuthServiceError(
      'invalid_verification_token',
      400,
      'Invalid verification link',
      'This verification link is invalid.',
    );
  }
  if (tokenRow.usedAt) {
    throw new AuthServiceError(
      'verification_token_already_used',
      400,
      'Verification link already used',
      'This verification link was already used.',
    );
  }
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw new AuthServiceError(
      'verification_token_expired',
      400,
      'Verification link expired',
      'This verification link has expired.',
    );
  }

  const updatedUser = await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(eq(emailVerificationTokens.id, tokenRow.id));

    const [updated] = await tx
      .update(users)
      .set({ emailVerified: true, updatedAt: now })
      .where(eq(users.id, tokenRow.userId))
      .returning();
    if (!updated) {
      throw new Error('User update returned no row.');
    }
    return updated;
  });

  return toPublicUser(updatedUser);
}

function isUniqueViolation(error: unknown): boolean {
  // postgres-js / node-postgres both surface Postgres's unique_violation as
  // error code 23505 on the thrown error object.
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
