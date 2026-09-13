import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { sessions } from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { registerUser } from './auth.service.js';
import {
  createSession,
  SESSION_ROLLING_THRESHOLD_MS,
  SESSION_TTL_MS,
  validateSession,
} from './session.js';

// Same live-Postgres contract as auth.routes.test.ts.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (session.test.ts needs a real, migrated Postgres database).',
  );
}

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: process.env.DATABASE_URL,
  WEB_ORIGIN: 'http://localhost:3000',
});

describe('session rolling expiry (ADR-013: extended at most once/day)', () => {
  // DELETE, not TRUNCATE CASCADE: see `auth.routes.test.ts`'s comment on its
  // own first `beforeEach` — same deadlock-avoidance reasoning applies here,
  // this is the second file touching the same tables.
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  async function createTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
    const { user } = await registerUser(
      app.db,
      `${randomUUID()}@example.test`,
      'a-strong-password-123',
    );
    return user;
  }

  it('extends expiresAt/lastUsedAt when used again after the rolling threshold', async () => {
    const app = await buildApp(testEnv);
    const user = await createTestUser(app);

    const start = new Date('2026-01-01T00:00:00Z');
    const created = await createSession(app.db, user.id, start);

    const later = new Date(
      start.getTime() + SESSION_ROLLING_THRESHOLD_MS + 1000,
    );
    const validated = await validateSession(app.db, created.token, later);
    expect(validated).not.toBeNull();

    const [row] = await app.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    if (!row) throw new Error('Session row not found');
    expect(row.expiresAt.getTime()).toBe(later.getTime() + SESSION_TTL_MS);
    expect(row.lastUsedAt.getTime()).toBe(later.getTime());

    await app.close();
  });

  it('does not change expiresAt/lastUsedAt when used again before the rolling threshold', async () => {
    const app = await buildApp(testEnv);
    const user = await createTestUser(app);

    const start = new Date('2026-01-01T00:00:00Z');
    const created = await createSession(app.db, user.id, start);

    const soon = new Date(
      start.getTime() + SESSION_ROLLING_THRESHOLD_MS - 1000,
    );
    const validated = await validateSession(app.db, created.token, soon);
    expect(validated).not.toBeNull();

    const [row] = await app.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    if (!row) throw new Error('Session row not found');
    expect(row.expiresAt.getTime()).toBe(created.expiresAt.getTime());
    expect(row.lastUsedAt.getTime()).toBe(start.getTime());

    await app.close();
  });

  it('returns null for an expired session', async () => {
    const app = await buildApp(testEnv);
    const user = await createTestUser(app);

    const start = new Date('2026-01-01T00:00:00Z');
    const created = await createSession(app.db, user.id, start);
    const afterExpiry = new Date(created.expiresAt.getTime() + 1000);

    const validated = await validateSession(app.db, created.token, afterExpiry);
    expect(validated).toBeNull();

    await app.close();
  });

  it('returns null for an unknown token', async () => {
    const app = await buildApp(testEnv);

    const validated = await validateSession(app.db, 'not-a-real-session-token');
    expect(validated).toBeNull();

    await app.close();
  });
});
