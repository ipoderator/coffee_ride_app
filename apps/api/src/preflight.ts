import type { Env } from './env.js';

// CR-210. A second tier below `env.ts`'s `PRODUCTION_PLACEHOLDER_CHECKS`.
//
// That tier refuses to boot: a value is missing or is still a local-dev
// placeholder, so the process must not run at all. This tier is for the
// opposite failure shape — configuration that parses cleanly, boots fine, and
// is a *supported* degraded mode at the application level, but that in
// production means a user-facing feature is quietly dead. The canonical case
// is `UNISENDER_API_KEY` set with `EMAIL_FROM_ADDRESS` empty: `plugins/
// email.ts`'s all-or-nothing gate leaves `app.emailProvider` null, every auth
// email producer no-ops (`.claude/rules/resilience.md`), and the
// verify-email/password-reset screens exist with no way for a real user to
// ever receive their link (KI-026/KI-042).
//
// A warning never blocks a boot that works today — degraded modes stay
// deliberately supported (ADR-016, KI-046). It makes the operator's own
// omission visible instead of leaving it to be discovered by a user who can't
// reset their password.
//
// Messages name the field and the consequence, never the value
// (`.claude/rules/security.md`: never log secrets).

export type PreflightSeverity = 'warning';

export interface PreflightFinding {
  severity: PreflightSeverity;
  /** The variable(s) the operator has to act on. */
  keys: ReadonlyArray<keyof Env>;
  /** What is configured, in terms of configuration only. */
  problem: string;
  /** What a real user experiences because of it. */
  consequence: string;
  /** The concrete action that resolves it. */
  action: string;
}

interface PreflightCheck {
  keys: ReadonlyArray<keyof Env>;
  applies: (env: Env) => boolean;
  problem: string;
  consequence: string;
  action: string;
}

const CHECKS: ReadonlyArray<PreflightCheck> = [
  {
    // KI-026/KI-042's remaining half. The pair gate lives in
    // `plugins/email.ts`; this reports the half-configured state it silently
    // absorbs.
    keys: ['UNISENDER_API_KEY', 'EMAIL_FROM_ADDRESS'],
    applies: (env) =>
      env.UNISENDER_API_KEY !== undefined &&
      env.EMAIL_FROM_ADDRESS === undefined,
    problem:
      'UNISENDER_API_KEY is set but EMAIL_FROM_ADDRESS is empty, so no email provider is constructed.',
    consequence:
      'No transactional email is ever sent: email verification and password reset are unusable end to end for a real user — the screens exist, but the link they need is never delivered (KI-026, KI-042).',
    action:
      'Set EMAIL_FROM_ADDRESS to a sender address verified in the Unisender Go account (an unverified address is rejected by Unisender, not by this app).',
  },
  {
    // The mirror image, for completeness: a sender with no key is equally
    // half-configured and equally silent.
    keys: ['EMAIL_FROM_ADDRESS', 'UNISENDER_API_KEY'],
    applies: (env) =>
      env.EMAIL_FROM_ADDRESS !== undefined &&
      env.UNISENDER_API_KEY === undefined,
    problem:
      'EMAIL_FROM_ADDRESS is set but UNISENDER_API_KEY is empty, so no email provider is constructed.',
    consequence:
      'Same as a missing sender: email verification and password reset deliver nothing (KI-026, KI-042).',
    action:
      "Set UNISENDER_API_KEY from the Unisender Go account's API settings, or clear EMAIL_FROM_ADDRESS to make the degraded mode explicit.",
  },
  {
    keys: ['UNISENDER_API_KEY'],
    applies: (env) =>
      env.UNISENDER_API_KEY === undefined &&
      env.EMAIL_FROM_ADDRESS === undefined,
    problem: 'No email provider is configured at all.',
    consequence:
      'Email verification and password reset cannot complete for a real user; registration still works, but an organizer who needs a verified email to publish a ride has no in-app path to one (KI-026, KI-042).',
    action:
      'Set UNISENDER_API_KEY and EMAIL_FROM_ADDRESS together (ADR-007), or accept that both flows stay dev-only.',
  },
  {
    keys: ['MAPS_2GIS_API_KEY'],
    applies: (env) => env.MAPS_2GIS_API_KEY === undefined,
    problem:
      'MAPS_2GIS_API_KEY is empty, so apps/api has no routing/geocoding key.',
    consequence:
      'Route building and geocoding answer their documented degraded states instead of real routes (KI-031).',
    action:
      'Set MAPS_2GIS_API_KEY to a commercial 2GIS key with Routing + Geocoder enabled. A demo key refuses points over 50 km apart (KI-075).',
  },
  {
    keys: ['REDIS_URL'],
    applies: (env) => env.REDIS_URL === undefined,
    problem: 'REDIS_URL is empty, so no notification queue exists.',
    consequence:
      'Notification delivery and ride-update fan-out run degraded; rate-limit counters do not survive an API restart.',
    action:
      'Point REDIS_URL at a real, separately provisioned Redis instance (docker-compose.prod.yml never runs one itself, ADR-018).',
  },
  {
    keys: ['S3_ENDPOINT'],
    applies: (env) => env.S3_ENDPOINT === undefined,
    problem: 'S3_ENDPOINT is empty, so no object storage is configured.',
    consequence:
      'GPX/route file upload and download surface an "upload unavailable" state rather than working.',
    action:
      'Point the S3_* variables at a real S3-compatible store (real S3 or self-hosted MinIO).',
  },
  {
    // ADR-030's decision, made explicit rather than silent: unset is the
    // accepted launch configuration, so this says "confirm", not "fix".
    keys: ['ERROR_REPORTING_WEBHOOK_URL'],
    applies: (env) => env.ERROR_REPORTING_WEBHOOK_URL === undefined,
    problem:
      'ERROR_REPORTING_WEBHOOK_URL is empty, so errors are not forwarded off the host.',
    consequence:
      "Unexpected 500s and failed notification jobs are visible only in the containers' stdout logs — nothing alerts, and logs are lost with the container unless the host ships them somewhere.",
    action:
      'Accepted for launch per ADR-030 — make sure the host retains or ships container logs. Set this to a webhook sink once error volume justifies one.',
  },
];

/**
 * Reports configuration that boots successfully but leaves a user-facing
 * feature non-functional. Pure: takes an already-validated `Env`, returns
 * findings, never logs or exits — the caller decides how to present them
 * (`scripts/preflight.mjs` prints a report, `app.ts` logs at boot).
 */
export function runPreflight(env: Env): PreflightFinding[] {
  return CHECKS.filter((check) => check.applies(env)).map((check) => ({
    severity: 'warning' as const,
    keys: check.keys,
    problem: check.problem,
    consequence: check.consequence,
    action: check.action,
  }));
}
