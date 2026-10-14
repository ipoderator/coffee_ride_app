# Current task — CR-251 — Redis command args (job email + token link) reach the log

Source: owner, 2026-10-14 ("нужно решить проблему" — CR-250's Found list). Branch
`fix/redact-redis-command-args`.

## Goal

ioredis attaches `command: { name, args }` to reply/abort errors and pino's `err`
serializer logs it. A BullMQ `queue.add()` passes the job JSON as an arg, so a Redis
error during an enqueue logged the recipient email and the one-time verify/reset link
(`sendVerificationEmail`/`sendPasswordResetEmail` catch → `logger.error({ err })`).

## Requirements / acceptance

1. No log line of `apps/api` carries a Redis command's args; the command name stays.
2. One app-wide rule (logger `redact`), not per call site.
3. Tests through the real Fastify/pino pipeline: top-level error, error in a property,
   `AggregateError` members; an ordinary error untouched.
4. api tests + coverage gate, typecheck, lint, prettier.

## Investigation

- Unisender errors were already safe: `redactEmails()` on the provider message,
  `failed_emails` → generic "rejected the recipient" (the CR-250 "Found" guess was wrong).
- Live: `evalsha` NOSCRIPT ReplyError with job JSON logged email + token without the
  rule, `args: "[redacted]"` with it. BullMQ 6.3.6 `addStandardJobArgs` pushes
  `job.data` into the command args.
- Production logs: 0 matching lines; the `api` container was recreated by the CR-250
  deploy and the `json-file` driver drops a removed container's log — nothing to purge.
- Dependabot #18 = `braces` GHSA-vfj7-8cjw-p6xm (KI-095): no patched release exists;
  only path is web's dev-only `eslint-config-next` → `fast-glob` → `micromatch`.

## Progress

- [x] implement - [x] tests - [x] validation - [x] close-task

## Validation results

- `pnpm test:coverage` (apps/api, live Redis/S3, `coffee_ride_test`): 56 files,
  770/770; `pnpm coverage:check` holds (api total +0.37, `lib/` +0.17).
- typecheck clean; lint 0 errors (8 pre-existing warnings, `scripts/preflight.ts`);
  prettier clean.

## Final result

Done locally; committed and going to `main` through a PR.
