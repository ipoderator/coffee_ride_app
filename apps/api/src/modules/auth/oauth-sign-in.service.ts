import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  authIdentities,
  legalAcceptances,
  passwordResetTokens,
  users,
} from 'db/schema';
import type { DbClient } from 'db';
import type { DbTransaction } from '../legal/legal.service.js';
import { markEmailVerified } from './auth.service.js';
import { revokeAllSessions } from './session.js';

// CR-247 (ADR-034), CR-260 (ADR-037): turns an identity a sign-in provider vouched for
// (Google's validated ID token, Yandex ID's profile) into one of our users. Runs in
// one transaction so the decision and the write can't be split by a concurrent
// request:
//
// 1. the provider account (`provider` + its stable id) is already linked → that user;
// 2. else a user with the identity's email exists (row locked `FOR UPDATE`) → linked.
//    CR-249 (ADR-035): if that account never confirmed its email, the provider's
//    verification proves the address is this person's, so the account is claimed:
//    email marked verified, password removed, every session and outstanding
//    verify/reset link voided, then linked. Whoever registered the address with a
//    password first (account pre-hijacking) keeps nothing — CR-247 refused instead,
//    which locked real owners out;
// 3. else a new user, `emailVerified = true` (the provider verified the address), no
//    password — CR-268 (ADR-041): only once the person accepted the documents; the
//    callbacks stop short of it (`allowCreate: false`) and `completeOAuthSignup`
//    runs it with the acceptance in the same transaction.
//
// Races: two callbacks for the same new person both reach step 3 — the loser's
// `INSERT … ON CONFLICT (email) DO NOTHING` waits for the winner, inserts nothing and
// re-reads the winner's row, which is verified, so it links; the identity insert has
// the same `ON CONFLICT DO NOTHING` against UNIQUE(provider, provider_account_id).
// A password registration racing step 3 loses on `users_email_unique` (409), or wins
// with an unverified row that step 2 then claims. One person signing in with Google
// and Yandex at once ends the same way: one user, one identity per provider.

/** `auth_identities.provider` values. */
export const OAUTH_PROVIDERS = ['google', 'yandex'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** What the provider vouched for about the person; nothing else is kept. */
export interface OAuthIdentity {
  /** The provider's stable account id (Google `sub`, Yandex ID `id`). */
  accountId: string;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

// `packages/types`' profile schema caps both names at 60 characters.
const NAME_MAX_LENGTH = 60;

export type OAuthSignInRefusal =
  // The provider did not vouch for the address (or sent none).
  | 'email_unverified'
  | 'blocked'
  // The provider account is linked to a different user than the email matched.
  | 'conflict';

export class OAuthSignInError extends Error {
  constructor(
    public readonly provider: OAuthProvider,
    public readonly reason: OAuthSignInRefusal,
  ) {
    super(`${provider} sign-in refused: ${reason}`);
    this.name = 'OAuthSignInError';
  }
}

export interface OAuthSignInResult {
  kind: 'signed_in';
  userId: string;
  created: boolean;
}

/**
 * CR-268 (ADR-041): the identity belongs to nobody yet, and creating its account
 * waits for the person to accept the documents (`oauth-signup.service.ts`).
 * Nothing was written.
 */
export interface OAuthConsentRequired {
  kind: 'consent_required';
}

function profileName(value: string | null): string | null {
  return value ? value.slice(0, NAME_MAX_LENGTH) : null;
}

/**
 * `allowCreate: false` (the callbacks, CR-268) stops before step 3: a would-be-new
 * account comes back as `consent_required` instead. Steps 1 and 2 sign in as
 * before — an existing account accepted (or re-accepts) the documents its own way.
 */
export function signInWithOAuth(
  db: DbClient,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  options?: { allowCreate?: true },
): Promise<OAuthSignInResult>;
export function signInWithOAuth(
  db: DbClient,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  options: { allowCreate: boolean },
): Promise<OAuthSignInResult | OAuthConsentRequired>;
export async function signInWithOAuth(
  db: DbClient,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  options: { allowCreate?: boolean } = {},
): Promise<OAuthSignInResult | OAuthConsentRequired> {
  return db.transaction((tx) =>
    signInWithOAuthInTransaction(tx, provider, identity, {
      allowCreate: options.allowCreate ?? true,
    }),
  );
}

/** {@link signInWithOAuth} inside the caller's transaction. */
export function signInWithOAuthInTransaction(
  tx: DbTransaction,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  options?: { allowCreate?: true },
): Promise<OAuthSignInResult>;
export function signInWithOAuthInTransaction(
  tx: DbTransaction,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  options: { allowCreate: boolean },
): Promise<OAuthSignInResult | OAuthConsentRequired>;
export async function signInWithOAuthInTransaction(
  tx: DbTransaction,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  { allowCreate = true }: { allowCreate?: boolean } = {},
): Promise<OAuthSignInResult | OAuthConsentRequired> {
  const refuse = (reason: OAuthSignInRefusal) =>
    new OAuthSignInError(provider, reason);
  if (!identity.email || !identity.emailVerified) {
    throw refuse('email_unverified');
  }
  const email = identity.email.toLowerCase();
  const firstName = profileName(identity.givenName);
  const lastName = profileName(identity.familyName);

  const [linked] = await tx
    .select({ id: users.id, blockedAt: users.blockedAt })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(
      and(
        eq(authIdentities.provider, provider),
        eq(authIdentities.providerAccountId, identity.accountId),
      ),
    )
    .limit(1);
  if (linked) {
    if (linked.blockedAt) throw refuse('blocked');
    return { kind: 'signed_in', userId: linked.id, created: false };
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
    if (!allowCreate) return { kind: 'consent_required' };
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

  const now = new Date();
  if (!created) {
    if (user.blockedAt) throw refuse('blocked');
    if (!user.emailVerified) await claimUnverifiedAccount(tx, user.id, now);
  }

  const [identityRow] = await tx
    .insert(authIdentities)
    .values({
      userId: user.id,
      provider,
      providerAccountId: identity.accountId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [authIdentities.provider, authIdentities.providerAccountId],
    })
    .returning({ userId: authIdentities.userId });
  if (!identityRow) {
    // A concurrent callback for the same provider account linked it first.
    const [owner] = await tx
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerAccountId, identity.accountId),
        ),
      )
      .limit(1);
    if (owner?.userId !== user.id) throw refuse('conflict');
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

  return { kind: 'signed_in', userId: user.id, created };
}

/**
 * CR-249 (ADR-035): the provider vouched for the address of an account that never
 * confirmed it. Nothing set up before that confirmation survives: the password (it
 * may be a pre-hijacker's), every session, and every outstanding reset link; the
 * verification links are consumed by {@link markEmailVerified}. CR-268 (ADR-041):
 * nor the documents' acceptance — it was whoever registered the address, so the
 * address's real owner is asked to accept them (re-consent) before acting.
 */
async function claimUnverifiedAccount(
  tx: DbTransaction,
  userId: string,
  now: Date,
): Promise<void> {
  await markEmailVerified(tx, userId);
  await tx
    .update(users)
    .set({ passwordHash: null, updatedAt: now })
    .where(eq(users.id, userId));
  await tx
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
      ),
    );
  await revokeAllSessions(tx, userId);
  await tx.delete(legalAcceptances).where(eq(legalAcceptances.userId, userId));
}
