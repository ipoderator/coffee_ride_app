import { and, eq, isNull } from 'drizzle-orm';
import {
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  users,
} from 'db/schema';
import type { DbClient } from 'db';
import type { User } from 'types';
import { hashPassword, verifyPassword } from './password.js';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
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

// Exported: `auth.routes.ts`'s `GET /me` handler converts `request.user` (the
// raw row `plugins/auth.ts` attaches from the session lookup) the same way,
// rather than duplicating this mapping.
export function toPublicUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    // CR-013: always present (null when unset), same reasoning as every other
    // field here — this is the one place that maps a DB row to the public
    // shape, so every consumer (register/login/verify-email/me, and
    // `modules/users`' PATCH) gets these for free.
    displayName: row.displayName,
    phone: row.phone,
    bio: row.bio,
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

// CR-012, `.claude/rules/security.md`: one generic error, same status/body/
// title for "no such account" and "wrong password" — a distinct message for
// either would let a client enumerate registered emails.
const INVALID_CREDENTIALS = () =>
  new AuthServiceError(
    'invalid_credentials',
    401,
    'Invalid credentials',
    'Incorrect email or password.',
  );

/**
 * Verifies email+password and returns the public user on success. Does NOT
 * check `emailVerified` — that gate is organizer-action-specific
 * (`docs/auth.md`), not a login precondition. Deliberately does the same
 * amount of work (an Argon2id verify) whether or not the account exists, via
 * a dummy hash, so a timing difference doesn't itself leak account existence.
 */
export async function loginUser(
  db: DbClient,
  email: string,
  password: string,
): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!row) {
    // Still hash against something so the branch's latency stays close to the
    // real-account path (the dummy hash is a valid Argon2id hash of an
    // unrelated fixed value, never a real password).
    await verifyPassword(DUMMY_PASSWORD_HASH, password);
    throw INVALID_CREDENTIALS();
  }

  const valid = await verifyPassword(row.passwordHash, password);
  if (!valid) {
    throw INVALID_CREDENTIALS();
  }

  return toPublicUser(row);
}

export interface RequestPasswordResetResult {
  userFound: boolean;
  // Only set when `userFound` is true. The route layer (`auth.routes.ts`)
  // must NEVER let this reach an HTTP response — `POST
  // /v1/auth/forgot-password` returns the identical `204` regardless of this
  // value (`.claude/rules/security.md`: no account enumeration). Exposed here
  // only so tests can drive the reset flow without an email-delivery channel
  // (ADR-007, still Pending) — same reasoning as `registerUser`'s
  // `verificationToken`, minus the dev-only HTTP exposure that endpoint has.
  resetToken?: string;
}

/**
 * Always looks up the user and always returns promptly; branches only on
 * whether to insert a token, never on anything the caller (the route) could
 * turn into a response difference.
 */
export async function requestPasswordReset(
  db: DbClient,
  email: string,
): Promise<RequestPasswordResetResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!row) {
    return { userFound: false };
  }

  const rawToken = generateVerificationToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId: row.id,
    tokenHash,
    expiresAt,
  });

  return { userFound: true, resetToken: rawToken };
}

/**
 * Validates a reset token and, on success, changes the password, consumes
 * every other outstanding token for that user (a stale earlier link must not
 * still work once a newer one has succeeded), and revokes every session for
 * that user (`.claude/rules/security.md`: "a password change revokes every
 * session of that user") — all inside one transaction.
 */
export async function resetPassword(
  db: DbClient,
  rawToken: string,
  newPassword: string,
): Promise<User> {
  const tokenHash = hashToken(rawToken);

  const [tokenRow] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) {
    throw new AuthServiceError(
      'invalid_reset_token',
      400,
      'Invalid reset link',
      'This password reset link is invalid.',
    );
  }
  if (tokenRow.usedAt) {
    throw new AuthServiceError(
      'reset_token_already_used',
      400,
      'Reset link already used',
      'This password reset link was already used.',
    );
  }
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw new AuthServiceError(
      'reset_token_expired',
      400,
      'Reset link expired',
      'This password reset link has expired.',
    );
  }

  const passwordHash = await hashPassword(newPassword);

  const updatedUser = await db.transaction(async (tx) => {
    const now = new Date();

    const [updated] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, tokenRow.userId))
      .returning();
    if (!updated) {
      throw new Error('User update returned no row.');
    }

    // Sweeps up `tokenRow` itself (still unused, per the check above) plus
    // every other outstanding token for this user in one statement — no
    // separate "mark this one" / "mark the rest" pair needed.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, tokenRow.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await tx.delete(sessions).where(eq(sessions.userId, tokenRow.userId));

    return updated;
  });

  return toPublicUser(updatedUser);
}

// A real Argon2id hash of an arbitrary fixed value — used only as the
// constant-time-ish decoy in the unknown-email branch above, never checked
// against a real credential.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$H85KxcI2cY7gixskIZfJeA$IzOmi13jMDss9XG4hxW3gC/X3zxDIwEsRKdSegFAQeo';

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
