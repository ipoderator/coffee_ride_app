import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

// CR-135. The one e2e fixture that writes to Postgres directly: no API channel
// ever returns a raw password-reset token (`POST /v1/auth/forgot-password` is
// an unconditional `204`, `.claude/rules/security.md` — no enumeration), and
// only its SHA-256 hash is stored, so the token a real email would carry can't
// be read back. This inserts a row of the exact shape
// `apps/api/src/modules/auth/auth.service.ts`'s `requestPasswordReset` writes
// (same hash, same 30-min TTL) and hands the raw token to the spec, which then
// drives the real `/reset-password` UI + API with it. Test code only — apps/web
// runtime code still never touches the database (`.claude/rules/
// architecture.md`).
//
// Same database the API under test uses: playwright.config.ts's webServer
// default, overridden by `DATABASE_URL` exactly as there (CI sets it).
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/coffee_ride';

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export async function seedPasswordResetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await sql`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${userId}, ${tokenHash}, ${expiresAt})
    `;
  } catch (error) {
    // FK violation = the user isn't in *this* database: a reused local dev API
    // (`reuseExistingServer`) reads the root .env's DATABASE_URL, which this
    // process doesn't load — export the same DATABASE_URL for the test run.
    throw new Error(
      `seedPasswordResetToken: insert failed against ${new URL(DATABASE_URL).pathname} — is the API under test on the same DATABASE_URL? ${String(error)}`,
    );
  } finally {
    await sql.end();
  }
  return rawToken;
}
