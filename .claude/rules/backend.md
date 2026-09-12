# Backend Rules

Fastify + TypeScript + REST/OpenAPI.

The API owns:

- authentication;
- authorization;
- ride lifecycle;
- registration/capacity;
- organizer ownership;
- routes/stops/services;
- notifications;
- persistence orchestration.

Validate all external input at runtime with Zod.

Use transactions for atomic business operations.

Registration must atomically:

- verify the ride accepts registrations;
- verify capacity;
- prevent duplicate active registration;
- create/update waitlist state when applicable.

Every endpoint follows the contract fixed in `docs/decisions.md` → ADR-011:

- versioned path (`/v1/...`); `/health` is the one unversioned exception;
- collections are paginated (`?limit=`/`?cursor=`, `{ items, nextCursor }`) — a new
  collection endpoint without pagination is a contract bug;
- errors use `application/problem+json` (RFC 9457) with a stable machine-readable
  `code`, and `errors[]` for Zod validation failures.

Never leak stack traces or database internals in `detail` or anywhere else.
