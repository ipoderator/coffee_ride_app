import { z } from 'zod';

// Every variable apps/api's process might read, present or future — not just the
// ones some client already exists for. A future CR that wires up a new client
// (DB, Redis, S3, 2GIS) then finds its variable already typed and validated here,
// instead of adding a silent, unchecked `process.env.FOO` somewhere (CR-073).
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // Required unconditionally: apps/api has no meaningful boot state without it,
  // even before CR-012 wires up sessions that actually sign/verify with it.
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),

  // Required as of CR-011 (first real DB consumer — `src/plugins/db.ts`, auth
  // module). Redis/S3 stay optional: still no route consumes either yet
  // (CR-005/CR-006/CR-053+).
  DATABASE_URL: z.string().url(),
  // Required as of CR-012: the CSRF preHandler (`plugins/csrf.ts`) needs a
  // real value to compare `Origin`/`Referer` against in every environment,
  // not just production — an optional/defaulted value would mean local dev
  // silently runs with no real CSRF check.
  WEB_ORIGIN: z.string().url(),
  // Both preprocessed the same way as ERROR_REPORTING_WEBHOOK_URL below:
  // docker-compose.prod.yml wires these through `${VAR}` unconditionally
  // (KI-046), and Compose substitutes an empty string, not an absent
  // variable, for one left unset in `.env`. A bare `.url().optional()`
  // rejects `''` (only `undefined` counts as absent) and crashes boot even
  // though "Redis/S3 not configured" is a supported degraded mode
  // everywhere this env is consumed.
  REDIS_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  S3_ENDPOINT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  MAPS_2GIS_API_KEY: z.string().optional(),
  // CR-100 (ADR-007). Optional, same "not configured is a degraded mode"
  // shape as MAPS_2GIS_API_KEY/S3_* above: unset means `app.emailProvider`
  // is `null` and auth email-sending producers silently no-op (dev-only
  // token stays available via the API response, same as before this
  // ticket). `UNISENDER_API_KEY`/`EMAIL_FROM_ADDRESS` must both be set to
  // activate — `plugins/email.ts` requires the pair together, same
  // all-or-nothing gate `plugins/s3.ts` uses for its five S3_* vars.
  UNISENDER_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().optional(),
  ),
  // Unisender Go is split across data centers (go1/go2) per account — this
  // must match whichever one the account was created on (shown in its
  // dashboard), not a single fixed vendor URL.
  UNISENDER_API_URL: z
    .string()
    .url()
    .default('https://go1.unisender.ru/ru/transactional/api/v1/'),
  // Must be a sender address verified in the Unisender Go account — no safe
  // universal default exists (account-specific), unlike EMAIL_FROM_NAME.
  EMAIL_FROM_ADDRESS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().email().optional(),
  ),
  EMAIL_FROM_NAME: z.string().default('Coffee Ride'),
  // CR-079/KI-006. Optional: no error-tracking vendor is decided yet (no ADR
  // names one) — unset means `app.reportError` (plugins/error-reporting.ts)
  // only logs structurally. Same empty-string-from-Compose preprocessing as
  // REDIS_URL/S3_ENDPOINT above (this field is what originally surfaced
  // KI-046).
  ERROR_REPORTING_WEBHOOK_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  // KI-014: overrides `max` for both auth rate-limit tiers (per-IP and
  // per-account, `modules/auth/auth.routes.ts`); unset = the real default (5)
  // and the window stays 1 minute. Exists only so repeated local/CI e2e runs
  // (`apps/web/playwright.config.ts`) don't trip 429 on /v1/auth/register —
  // counters can live in Redis and survive an API restart. `loadEnv()` below
  // refuses to boot in production with it set at all
  // (`.claude/rules/security.md`: auth endpoints stay aggressively limited).
  AUTH_RATE_LIMIT_MAX: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

const isLocalhost = (value: string) =>
  value.includes('localhost') || value.includes('127.0.0.1');

// Values shipped in .env.example purely as local-dev convenience. Booting a
// production process with one of these still in place means the operator forgot
// to configure something real — refuse to start rather than run with a
// known-insecure or known-local value (CR-073).
const PRODUCTION_PLACEHOLDER_CHECKS: ReadonlyArray<{
  key: keyof Env;
  isPlaceholder: (value: string) => boolean;
  message: string;
}> = [
  {
    key: 'AUTH_SECRET',
    isPlaceholder: (v) => v === 'change-me',
    message:
      "AUTH_SECRET is still the placeholder value 'change-me'. Generate one with: openssl rand -base64 32",
  },
  {
    key: 'S3_ACCESS_KEY_ID',
    isPlaceholder: (v) => v === 'minio',
    message: 'S3_ACCESS_KEY_ID is still the local MinIO default.',
  },
  {
    key: 'S3_SECRET_ACCESS_KEY',
    isPlaceholder: (v) => v === 'minio12345',
    message: 'S3_SECRET_ACCESS_KEY is still the local MinIO default.',
  },
  {
    key: 'DATABASE_URL',
    isPlaceholder: isLocalhost,
    message: 'DATABASE_URL still points at localhost.',
  },
  {
    key: 'REDIS_URL',
    isPlaceholder: isLocalhost,
    message: 'REDIS_URL still points at localhost.',
  },
  {
    key: 'S3_ENDPOINT',
    isPlaceholder: isLocalhost,
    message: 'S3_ENDPOINT still points at localhost.',
  },
  {
    key: 'WEB_ORIGIN',
    isPlaceholder: isLocalhost,
    message: 'WEB_ORIGIN still points at localhost.',
  },
];

/**
 * Parses and validates `process.env` (or a provided source, for tests). Throws
 * with a message safe to log — field names and reasons only, never the
 * offending values themselves (.claude/rules/security.md: never log secrets).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const violations = PRODUCTION_PLACEHOLDER_CHECKS.filter(
      ({ key, isPlaceholder }) => {
        const value = env[key];
        return typeof value === 'string' && isPlaceholder(value);
      },
    ).map(({ message }) => message);

    // Not a placeholder check (any value is a relaxation, including 5): the
    // override is test/dev-only by design, so production must use the
    // hard-coded tiers in auth.routes.ts unconditionally.
    if (env.AUTH_RATE_LIMIT_MAX !== undefined) {
      violations.push(
        'AUTH_RATE_LIMIT_MAX is set — it is a test/dev-only override of the auth rate limit and must be unset in production.',
      );
    }

    if (violations.length > 0) {
      throw new Error(
        `Refusing to start in production with placeholder/unsafe configuration:\n- ${violations.join('\n- ')}`,
      );
    }
  }

  return env;
}
