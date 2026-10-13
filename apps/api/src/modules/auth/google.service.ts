import { and, eq, sql } from 'drizzle-orm';
import { authIdentities, users } from 'db/schema';
import type { DbClient } from 'db';
import type { GoogleIdentity } from './google-client.js';

// CR-247 (ADR-034): turns a validated Google ID token into one of our users. Runs in
// one transaction so the decision and the write can't be split by a concurrent
// request:
//
// 1. the Google account (`sub`) is already linked → that user;
// 2. else a user with the token's email exists (row locked `FOR UPDATE`) → linked,
//    but only when that account's email is verified: linking an unverified account
//    would hand it to whoever registered the address with a password first
//    (account pre-hijacking), so that one is refused;
// 3. else a new user, `emailVerified = true` (Google verified the address), no
//    password.
//
// Races: two callbacks for the same new person both reach step 3 — the loser's
// `INSERT … ON CONFLICT (email) DO NOTHING` waits for the winner, inserts nothing and
// re-reads the winner's row, which is verified, so it links; the identity insert has
// the same `ON CONFLICT DO NOTHING` against UNIQUE(provider, provider_account_id).
// A password registration racing step 3 loses on `users_email_unique` (409), or wins
// with an unverified row that step 2 then refuses.

export const GOOGLE_PROVIDER = 'google';

// `packages/types`' profile schema caps both names at 60 characters.
const NAME_MAX_LENGTH = 60;

export type GoogleSignInRefusal =
  // Google did not vouch for the address (or sent none).
  | 'email_unverified'
  // An existing account with this email never confirmed it.
  | 'account_unverified'
  | 'blocked'
  // The Google account is linked to a different user than the email matched.
  | 'conflict';

export class GoogleSignInError extends Error {
  constructor(public readonly reason: GoogleSignInRefusal) {
    super(`Google sign-in refused: ${reason}`);
    this.name = 'GoogleSignInError';
  }
}

export interface GoogleSignInResult {
  userId: string;
  created: boolean;
}

function profileName(value: string | null): string | null {
  return value ? value.slice(0, NAME_MAX_LENGTH) : null;
}

export async function signInWithGoogle(
  db: DbClient,
  identity: GoogleIdentity,
): Promise<GoogleSignInResult> {
  if (!identity.email || !identity.emailVerified) {
    throw new GoogleSignInError('email_unverified');
  }
  const email = identity.email.toLowerCase();
  const firstName = profileName(identity.givenName);
  const lastName = profileName(identity.familyName);

  return db.transaction(async (tx) => {
    const [linked] = await tx
      .select({ id: users.id, blockedAt: users.blockedAt })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(
        and(
          eq(authIdentities.provider, GOOGLE_PROVIDER),
          eq(authIdentities.providerAccountId, identity.sub),
        ),
      )
      .limit(1);
    if (linked) {
      if (linked.blockedAt) throw new GoogleSignInError('blocked');
      return { userId: linked.id, created: false };
    }

    const lockUserByEmail = () =>
      tx
        .select({
          id: users.id,
          emailVerified: users.emailVerified,
          blockedAt: users.blockedAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .for('update')
        .limit(1);

    let created = false;
    let [user] = await lockUserByEmail();
    if (!user) {
      const [inserted] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null,
          emailVerified: true,
          firstName,
          lastName,
        })
        .onConflictDoNothing({ target: users.email })
        .returning({
          id: users.id,
          emailVerified: users.emailVerified,
          blockedAt: users.blockedAt,
        });
      if (inserted) {
        created = true;
        user = inserted;
      } else {
        // A concurrent request created the account between our read and insert.
        [user] = await lockUserByEmail();
        if (!user) throw new Error('User vanished after an email conflict.');
      }
    }

    if (!created) {
      if (!user.emailVerified)
        throw new GoogleSignInError('account_unverified');
      if (user.blockedAt) throw new GoogleSignInError('blocked');
    }

    const now = new Date();
    const [identityRow] = await tx
      .insert(authIdentities)
      .values({
        userId: user.id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: identity.sub,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [authIdentities.provider, authIdentities.providerAccountId],
      })
      .returning({ userId: authIdentities.userId });
    if (!identityRow) {
      // A concurrent callback for the same Google account linked it first.
      const [owner] = await tx
        .select({ userId: authIdentities.userId })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, GOOGLE_PROVIDER),
            eq(authIdentities.providerAccountId, identity.sub),
          ),
        )
        .limit(1);
      if (owner?.userId !== user.id) throw new GoogleSignInError('conflict');
    }

    // Names only into empty fields: never overwrite what the user typed.
    if (!created && (firstName || lastName)) {
      await tx
        .update(users)
        .set({
          firstName: sql`coalesce(${users.firstName}, ${firstName})`,
          lastName: sql`coalesce(${users.lastName}, ${lastName})`,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));
    }

    return { userId: user.id, created };
  });
}
