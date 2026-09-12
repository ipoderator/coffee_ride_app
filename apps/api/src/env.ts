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

  // Not consumed by any code yet (CR-004/CR-005/CR-006/CR-053+) — optional so a
  // bare bootstrap boots, but still typed and still checked for known-unsafe
  // production values below once something does read them.
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  MAPS_2GIS_API_KEY: z.string().optional(),
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

    if (violations.length > 0) {
      throw new Error(
        `Refusing to start in production with placeholder/unsafe configuration:\n- ${violations.join('\n- ')}`,
      );
    }
  }

  return env;
}
