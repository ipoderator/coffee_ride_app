import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { legalAcceptances, users } from 'db/schema';
import {
  currentLegalVersion,
  isLegalAcceptanceCurrent,
  LEGAL_DOCUMENTS,
  type LegalDocumentVersion,
  pendingLegalDocuments,
} from 'types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { hashPassword } from '../auth/password.js';
import { CONSENTS } from '../../test-support/legal.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-269 (ADR-041): consents on account creation, the audit trail, re-consent and
// the gate that holds mutations until a material new version is accepted.

const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
  AUTH_RATE_LIMIT_MAX: '1000',
});

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp(testEnv);
  await app.db.execute(sql`DELETE FROM users`);
});

afterEach(async () => {
  await app.close();
});

const uniqueEmail = () => `${randomUUID()}@example.test`;

function register(payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload,
  });
}

async function acceptancesOf(email: string) {
  const [user] = await app.db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (!user) return [];
  return app.db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, user.id));
}

/** A verified password account with NO acceptance — one from before CR-269. */
async function legacyUserSession(): Promise<{ cookie: string; id: string }> {
  const email = uniqueEmail();
  const [user] = await app.db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(PASSWORD),
      emailVerified: true,
    })
    .returning();
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  expect(login.statusCode).toBe(200);
  const session = login.cookies.find((c) => c.name === 'session')!;
  return { cookie: `session=${session.value}`, id: user!.id };
}

function accept(cookie: string, consents: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/v1/legal/acceptances',
    headers: { cookie, origin: WEB_ORIGIN },
    payload: { consents },
  });
}

function updateProfile(cookie: string) {
  return app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: { cookie, origin: WEB_ORIGIN },
    payload: { firstName: 'Аня' },
  });
}

/** Publishes an extra version of the terms for one test. */
async function withTermsVersion<T>(
  version: LegalDocumentVersion,
  run: () => Promise<T>,
): Promise<T> {
  const original = LEGAL_DOCUMENTS.terms;
  LEGAL_DOCUMENTS.terms = {
    ...original,
    versions: [...original.versions, version],
  };
  try {
    return await run();
  } finally {
    LEGAL_DOCUMENTS.terms = original;
  }
}

const NEXT_TERMS: LegalDocumentVersion = {
  version: '2.0',
  effectiveAt: '2027-01-01',
  sha256: 'a'.repeat(64),
  material: true,
  summary: 'test',
};

describe('POST /v1/auth/register — consents', () => {
  it('records both documents at their current version and hash, with the account', async () => {
    const email = uniqueEmail();
    const before = Date.now();
    const response = await register({
      email,
      password: PASSWORD,
      consents: CONSENTS,
    });
    expect(response.statusCode).toBe(201);

    const rows = await acceptancesOf(email);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const document = row.document as 'terms' | 'personal_data_consent';
      expect(row).toMatchObject({
        version: currentLegalVersion(document).version,
        contentSha256: currentLegalVersion(document).sha256,
        source: 'register_password',
      });
      expect(row.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
  });

  it('refuses a direct API call without both consents and creates nothing', async () => {
    const email = uniqueEmail();
    for (const consents of [
      undefined,
      {},
      { terms: CONSENTS.terms },
      { personal_data_consent: CONSENTS.personal_data_consent },
      { terms: true, personal_data_consent: true },
      { terms: '', personal_data_consent: '' },
    ]) {
      const response = await register({ email, password: PASSWORD, consents });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
    }
    expect(await app.db.select().from(users)).toHaveLength(0);
  });

  it('answers a stale version with 409 legal_version_outdated and creates nothing', async () => {
    const email = uniqueEmail();
    const response = await register({
      email,
      password: PASSWORD,
      consents: { ...CONSENTS, personal_data_consent: '0.9' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('legal_version_outdated');
    expect(await app.db.select().from(users)).toHaveLength(0);
  });

  it('adds nothing to an existing account when its email registers again (ADR-039)', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, consents: CONSENTS });
    const again = await register({
      email,
      password: 'another-password-456',
      consents: CONSENTS,
    });
    expect(again.statusCode).toBe(201);
    expect(await acceptancesOf(email)).toHaveLength(2);
  });

  it('writes exactly one pair of rows under concurrent registrations', async () => {
    const email = uniqueEmail();
    await Promise.all(
      [0, 1, 2, 3].map(() =>
        register({ email, password: PASSWORD, consents: CONSENTS }),
      ),
    );
    expect(await app.db.select().from(users)).toHaveLength(1);
    expect(await acceptancesOf(email)).toHaveLength(2);
  });

  it('enforces the audit invariants in the database itself', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, consents: CONSENTS });
    const [user] = await app.db.select().from(users);
    const row = {
      userId: user!.id,
      document: 'terms',
      version: '9.9',
      contentSha256: 'b'.repeat(64),
      source: 'reconsent',
    };
    for (const bad of [
      { ...row, document: 'privacy' },
      { ...row, source: 'admin' },
      { ...row, contentSha256: 'not-a-hash' },
      { ...row, version: '  ' },
    ]) {
      await expect(
        app.db.insert(legalAcceptances).values(bad),
      ).rejects.toThrow();
    }
  });
});

describe('re-consent and the gate', () => {
  it('reports both documents pending for an account that never accepted them', async () => {
    const { cookie } = await legacyUserSession();
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie },
    });
    expect(me.json().legal).toEqual({
      pending: ['terms', 'personal_data_consent'],
    });
  });

  it('holds every change until acceptance, but never reads or logout', async () => {
    const { cookie } = await legacyUserSession();

    const held = await updateProfile(cookie);
    expect(held.statusCode).toBe(403);
    expect(held.json().code).toBe('legal_acceptance_required');

    const read = await app.inject({
      method: 'GET',
      url: '/v1/notifications/mine',
      headers: { cookie },
    });
    expect(read.statusCode).toBe(200);

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(logout.statusCode).toBe(204);
  });

  it('refuses missing, partial and stale acceptances', async () => {
    const { cookie } = await legacyUserSession();

    const missing = await accept(cookie, {});
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe('consent_required');

    const partial = await accept(cookie, { terms: CONSENTS.terms });
    expect(partial.statusCode).toBe(400);
    expect(partial.json().code).toBe('consent_required');

    const stale = await accept(cookie, { ...CONSENTS, terms: '0.9' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('legal_version_outdated');

    expect((await updateProfile(cookie)).statusCode).toBe(403);
  });

  it('accepts the pending documents, idempotently, and opens the account', async () => {
    const { cookie, id } = await legacyUserSession();

    const accepted = await accept(cookie, CONSENTS);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ pending: [] });
    const again = await accept(cookie, CONSENTS);
    expect(again.statusCode).toBe(200);

    const rows = await app.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, id));
    expect(rows.map((r) => r.source)).toEqual(['reconsent', 'reconsent']);
    expect((await updateProfile(cookie)).statusCode).toBe(200);
  });

  it('records one pair under concurrent acceptances', async () => {
    const { cookie, id } = await legacyUserSession();
    const answers = await Promise.all(
      [0, 1, 2].map(() => accept(cookie, CONSENTS)),
    );
    expect(answers.every((a) => a.statusCode === 200)).toBe(true);
    const rows = await app.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, id));
    expect(rows).toHaveLength(2);
  });

  it('needs a session to accept', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/legal/acceptances',
      headers: { origin: WEB_ORIGIN },
      payload: { consents: CONSENTS },
    });
    expect(response.statusCode).toBe(401);
  });

  it('asks again for a material new version only, keeping the other document', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD, consents: CONSENTS });
    const [user] = await app.db.select().from(users);
    await app.db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user!.id));
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload: { email, password: PASSWORD },
    });
    const cookie = `session=${login.cookies.find((c) => c.name === 'session')!.value}`;

    await withTermsVersion(NEXT_TERMS, async () => {
      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { cookie },
      });
      expect(me.json().legal).toEqual({ pending: ['terms'] });
      expect((await updateProfile(cookie)).statusCode).toBe(403);

      // The old version no longer counts; the new one does.
      const stale = await accept(cookie, { terms: CONSENTS.terms });
      expect(stale.json().code).toBe('legal_version_outdated');
      const accepted = await accept(cookie, { terms: '2.0' });
      expect(accepted.json()).toEqual({ pending: [] });
      expect((await updateProfile(cookie)).statusCode).toBe(200);
    });
  });

  it('keeps earlier acceptances valid across a non-material version', async () => {
    const { cookie } = await legacyUserSession();
    await accept(cookie, CONSENTS);
    await withTermsVersion({ ...NEXT_TERMS, material: false }, async () => {
      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { cookie },
      });
      expect(me.json().legal).toEqual({ pending: [] });
    });
  });
});

describe('GET /v1/legal/documents', () => {
  it('lists the current version of every document, publicly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/legal/documents',
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items as Array<Record<string, unknown>>;
    expect(items.map((i) => [i.type, i.version, i.acceptanceRequired])).toEqual(
      [
        ['terms', CONSENTS.terms, true],
        ['privacy', currentLegalVersion('privacy').version, false],
        ['personal_data_consent', CONSENTS.personal_data_consent, true],
      ],
    );
  });
});

describe('legal registry helpers', () => {
  it('counts the latest material version or later, never an unknown one', () => {
    expect(isLegalAcceptanceCurrent('terms', CONSENTS.terms)).toBe(true);
    expect(isLegalAcceptanceCurrent('terms', 'nope')).toBe(false);
    expect(
      pendingLegalDocuments([
        { document: 'terms', version: CONSENTS.terms },
        { document: 'privacy', version: '1.0' },
      ]),
    ).toEqual(['personal_data_consent']);
  });
});
