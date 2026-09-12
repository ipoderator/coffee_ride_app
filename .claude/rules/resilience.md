# Resilience Rules

See `docs/decisions.md` → ADR-008. The architecture is a modular monolith, not
microservices. This file defines how failure isolation is achieved instead: patterns, not
network boundaries.

## Principle

A failure in a non-critical or external-dependent area must never take down or block a
critical user journey (registration, login, viewing a ride). Isolate by boundary and
by async/sync split, not by process/deployment split.

## External integrations (2GIS, S3/MinIO, future notification provider)

Every external call must have:

- an explicit timeout (never rely on the default/no timeout);
- a bounded number of retries with backoff, only for idempotent operations;
- a circuit breaker (or equivalent short-circuit) so a degraded provider doesn't cascade
  into request pileups/timeouts across the whole API;
- a defined fallback/degraded behavior — e.g. if 2GIS geocoding fails, the ride can
  still be created/viewed without geocoded coordinates rather than failing the whole
  request; if S3 is unreachable, surface a clear "upload unavailable" state rather than a
  generic 500.

Never let an external integration's failure propagate into a failed database transaction
that also contains critical state changes (e.g. do not wrap a notification send in the
same transaction as a registration insert).

## Async by default for non-critical side effects

Notification delivery, ride-update fan-out, and any other "nice to have but not required
for the core action to succeed" side effect must run outside the request/response cycle
and outside the critical transaction:

- the triggering action (e.g. registration) commits first;
- the side effect (e.g. sending a confirmation) is queued (Redis) and processed separately;
- a failure in the queued job must be retried/logged, and must never roll back or block the
  action that triggered it.

This is what actually satisfies "an error in one area shouldn't take down everything" —
not a separate deployable service.

## Module boundaries (the seams for future extraction, if ever needed)

Keep `auth`, `users`, `organizers`, `rides`, `routes`, `registrations`, `notifications`,
`reviews` as internally cohesive modules with explicit interfaces between them (see
`rules/architecture.md`). Do not let one module reach into another's tables/internals
directly.

This is deliberate: if a specific module later needs independent scaling or on-call
ownership (ADR-008 explains when that's justified), a well-bounded module is extractable
into a real service without a rewrite. Until then, it stays in-process because that's
simpler and safer at this scale.

## Database-level protection

Critical invariants (capacity, duplicate registration, waitlist consistency — see
`rules/database.md`) are enforced inside a single transaction with proper constraints.
Do not decompose these into multi-step, multi-service operations "for resilience" — that
would remove the atomicity guarantee that actually protects correctness.

## Health checks and degradation

- `apps/api` exposes a health check endpoint that reports the status of its own
  dependencies (DB, Redis, S3) without dying if one is degraded.
- The frontend must handle a degraded API response (e.g. maps unavailable, uploads
  unavailable) with a clear partial-failure UI state, not a blank screen or crash.

## What NOT to do

- Do not introduce a second deployable service "for resilience" without a new ADR.
- Do not add retries to non-idempotent operations (e.g. do not blindly retry a registration
  create without a duplicate-safe check).
- Do not let a background job failure silently disappear — log it and make it visible in
  `known-issues.md` if it recurs.
