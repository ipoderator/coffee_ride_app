import { and, eq, gt, lte } from 'drizzle-orm';
import type { DbClient } from 'db';
import { oauthPendingSignups } from 'db/schema';
import {
  CONSENT_DOCUMENT_TYPES,
  type LegalConsents,
  safeNextPath,
} from 'types';
import {
  assertCurrentConsents,
  recordAcceptances,
} from '../legal/legal.service.js';
import {
  type OAuthIdentity,
  type OAuthProvider,
  OAUTH_PROVIDERS,
  signInWithOAuthInTransaction,
} from './oauth-sign-in.service.js';
import { generateVerificationToken, hashToken } from './tokens.js';

// CR-269 (ADR-041): a first Google/Yandex sign-in creates the account only after the
// person accepts the documents. The callback (`google.routes.ts`/`yandex.routes.ts`)
// verified the identity; it parks here (`oauth_pending_signups`) under an opaque
// token whose SHA-256 is the row's key, and the browser gets the raw token in an
// httpOnly cookie. `/register/consent` reads the address back to show it and posts
// the consents; completing consumes the row — `DELETE … RETURNING` — in the very
// transaction that creates the account and records the acceptance, so a replayed or
// concurrent completion finds nothing and nothing is half-created.

export const OAUTH_SIGNUP_TTL_MS = 10 * 60_000;

export class OAuthSignupError extends Error {
  constructor(
    public readonly code: 'oauth_signup_expired' | 'oauth_signup_failed',
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'OAuthSignupError';
  }
}

const expired = () =>
  new OAuthSignupError(
    'oauth_signup_expired',
    410,
    'Sign-up expired',
    'This sign-up is no longer pending. Start the sign-in again.',
  );

function isProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Parks a verified identity that has no account yet and returns the raw token for
 * the cookie. A second sign-in by the same provider account replaces the first
 * (one pending row per account, the earlier token stops working).
 */
export async function startOAuthSignup(
  db: DbClient,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  next: string | null,
  now: Date = new Date(),
): Promise<string> {
  if (!identity.email) throw new Error('A pending sign-up needs an email.');
  const token = generateVerificationToken();
  const values = {
    tokenHash: hashToken(token),
    email: identity.email.toLowerCase(),
    givenName: identity.givenName,
    familyName: identity.familyName,
    next: safeNextPath(next),
    expiresAt: new Date(now.getTime() + OAUTH_SIGNUP_TTL_MS),
    createdAt: now,
  };
  await db.transaction(async (tx) => {
    // Nobody finishes a sign-up after 10 minutes; don't keep their data longer.
    await tx
      .delete(oauthPendingSignups)
      .where(lte(oauthPendingSignups.expiresAt, now));
    await tx
      .insert(oauthPendingSignups)
      .values({ provider, providerAccountId: identity.accountId, ...values })
      .onConflictDoUpdate({
        target: [
          oauthPendingSignups.provider,
          oauthPendingSignups.providerAccountId,
        ],
        set: values,
      });
  });
  return token;
}

/** What `/register/consent` shows: the provider and the address. */
export async function readOAuthSignup(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<{ provider: OAuthProvider; email: string }> {
  const [row] = await db
    .select({
      provider: oauthPendingSignups.provider,
      email: oauthPendingSignups.email,
    })
    .from(oauthPendingSignups)
    .where(
      and(
        eq(oauthPendingSignups.tokenHash, hashToken(token)),
        gt(oauthPendingSignups.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || !isProvider(row.provider)) throw expired();
  return { provider: row.provider, email: row.email };
}

/** «Отмена»: the parked identity is dropped at once. */
export async function cancelOAuthSignup(
  db: DbClient,
  token: string,
): Promise<void> {
  await db
    .delete(oauthPendingSignups)
    .where(eq(oauthPendingSignups.tokenHash, hashToken(token)));
}

export interface CompletedOAuthSignup {
  userId: string;
  provider: OAuthProvider;
  next: string | null;
}

/**
 * Accepts the documents and creates (or, if one appeared meanwhile, links) the
 * account, all or nothing. Stale versions are refused before the row is touched,
 * so the person can reload the page and try again within the 10 minutes.
 */
export async function completeOAuthSignup(
  db: DbClient,
  token: string,
  consents: LegalConsents,
  now: Date = new Date(),
): Promise<CompletedOAuthSignup> {
  assertCurrentConsents(consents, CONSENT_DOCUMENT_TYPES);
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .delete(oauthPendingSignups)
      .where(
        and(
          eq(oauthPendingSignups.tokenHash, hashToken(token)),
          gt(oauthPendingSignups.expiresAt, now),
        ),
      )
      .returning();
    if (!pending || !isProvider(pending.provider)) throw expired();

    const result = await signInWithOAuthInTransaction(tx, pending.provider, {
      accountId: pending.providerAccountId,
      email: pending.email,
      // Only verified addresses are ever parked (the callback checked).
      emailVerified: true,
      givenName: pending.givenName,
      familyName: pending.familyName,
    });
    await recordAcceptances(
      tx,
      result.userId,
      CONSENT_DOCUMENT_TYPES,
      pending.provider === 'google' ? 'oauth_google' : 'oauth_yandex',
    );
    return {
      userId: result.userId,
      provider: pending.provider,
      next: safeNextPath(pending.next),
    };
  });
}
