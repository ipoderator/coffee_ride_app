---
name: new-api-endpoint
description: Use when adding or changing a REST endpoint in apps/api — e.g. "add an endpoint for X", "create the API route for Y", "expose Z over the API". Enforces the route→validation→service→repository layering, server-side authorization, and Zod validation required by rules/backend.md and rules/security.md.
---

# New API Endpoint

Read first: `.claude/rules/backend.md`, `.claude/rules/security.md`, `docs/api.md`,
`.claude/rules/database.md` if the endpoint touches persistence.

## Steps

1. **Check `docs/api.md` first.** Does this endpoint already exist or overlap with one?
   Add the new route to that file as part of this change — it is the source of truth for
   the contract, not just documentation written after the fact.

2. **Layer it correctly**, handlers stay thin:
   ```
   route/controller → validation (Zod) → use case/service → repository/db
   ```
   Business logic and ownership checks live in the service layer, not the route handler.

3. **Validate all external input at runtime with Zod** — path/query/body. Reject before
   touching the database.

4. **Authorization — non-negotiable, server-side, every request:**
   - Derive identity only from the verified session, never from a client-supplied
     userId/organizerId/role field.
   - Check resource ownership (e.g. `ride.organizerId === session.userId`) in the
     service layer for any mutation.
   - Default-deny: if you're not sure this endpoint needs an authorization check, it does.

5. **Transactions.** Any operation with invariants (capacity, duplicate protection,
   waitlist — `.claude/rules/database.md`) must be atomic. Do not split a
   transactionally-required operation across multiple round trips.

6. **Rate limiting.** If this is an auth endpoint or otherwise abuse-prone, apply the
   stricter rate limit tier per `.claude/rules/security.md`, not the general one.

7. **Resilience.** If the endpoint calls an external integration (2GIS, S3,
   notifications), it must follow `.claude/rules/resilience.md` — timeout, bounded
   retries only for idempotent calls, circuit breaker, defined fallback. Side effects that
   aren't required for the endpoint to succeed (e.g. sending a notification) go through
   the async queue, not inline in the request.

8. **Errors.** Consistent error shape, no stack traces or DB internals leaked to the
   client — log details server-side instead.

9. **Response minimization.** Don't return more participant/organizer data than the
   caller's capability requires.

10. **Tests + docs.** Add tests for the happy path, the authorization-denied path, and
    the validation-failure path. Update `docs/api.md` if the contract shape changed.
    Update `docs/changelog.md` per `docs/definition-of-done.md`.
