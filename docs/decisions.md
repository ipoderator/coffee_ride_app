# Architecture Decision Log

## ADR-001 — Monorepo

Status: Accepted.
pnpm workspaces + Turborepo.

## ADR-002 — PostgreSQL + Drizzle

Status: Accepted.
Relational model and registration invariants.

## ADR-003 — 2GIS Maps

Status: Accepted for initial Russian-market integration (superseded 2026-09-09: switched
from Yandex Maps to 2GIS — see changelog).
Credentials, quotas, APIs and terms must be verified during implementation. Use the 2GIS
MapGL JS API for the web map, plus 2GIS Geocoder and Directions/Routing APIs as needed.

## ADR-004 — Redis

Status: Accepted as capability.
Use for caching, rate limiting, and jobs only when justified.

## ADR-005 — S3-compatible storage

Status: Accepted.
Local MinIO; production provider is deployment-specific.

## ADR-006 — Authentication & Authorization

Status: Accepted (architecture and requirements). The session-store question left
Pending here was resolved 2026-09-11 by ADR-013 (database-backed sessions) — the
text below stands as written.

Primary method: email + password (matches product requirement — users sign in "под
почтой, паролем"). Auth.js-compatible architecture so OAuth providers can be added later
without a rewrite, but OAuth is not required for MVP.

Full requirements are in `.claude/rules/security.md` — this ADR fixes the shape, not the
implementation details:

- authentication (who you are) and authorization (what you can do) are separate concerns,
  enforced separately, server-side, on every request;
- authorization is capability-based, not a rigid role enum: every `User` is a participant
  by default; an `OrganizerProfile` attached to a `User` grants organizer capabilities for
  resources that `User` owns. A user can hold both capabilities simultaneously (see
  `docs/product.md`). Ownership (`ride.organizerId === session.userId`) is checked per
  request — client-supplied role/identity claims are never trusted;
- passwords are hashed (Argon2id or bcrypt, cost/params per current OWASP guidance), never
  logged, never returned by any endpoint;
- sessions use httpOnly, Secure, SameSite cookies; the concrete session store
  (Auth.js session strategy — database-backed vs JWT) is the remaining Pending choice and
  must be made in a follow-up ADR before CR-012 ships.

## ADR-007 — Notifications

Status: Pending.
Start with in-app notifications; external provider later behind an adapter.

## ADR-008 — Modular monolith, not microservices (for MVP)

Status: Accepted.

The application ships as a modular monolith (`apps/web`, `apps/api`, single Postgres
database) rather than a distributed set of microservices, for as long as it remains
MVP-stage / single small team.

Rationale:

- Core invariants (registration availability, capacity, duplicate protection, waitlist —
  see `docs/database.md` / `rules/database.md`) require atomic, transactional guarantees.
  Splitting these across service boundaries would trade one DB transaction for a
  distributed transaction/saga, which is a _harder_ reliability problem, not an easier one.
- At MVP scale, the operational surface of real microservices (service discovery,
  inter-service auth, distributed tracing, N independent deployments, contract
  versioning) is itself a common source of outages, not a way to avoid them.
- The stated goal — "a bug in one area shouldn't take down everything" — is a resilience
  problem, not a deployment-topology problem. It is addressed directly by
  `.claude/rules/resilience.md`.

What this does NOT mean:

- Internal code must still be organized into strict domain modules with clear boundaries
  (auth, users, organizers, rides, routes, registrations, notifications, reviews — see
  `rules/backend.md` / `rules/architecture.md`), designed so any of them _could_ be
  extracted into a standalone service later if load/ownership genuinely requires it.
- High-risk, naturally-async components (notification delivery, file/GPX processing) are
  built behind an interface and a queue from day one specifically so they can be extracted
  or swapped without touching core booking logic — see `rules/resilience.md`.

Revisit this ADR (do not silently override it) if: a specific module needs independent
scaling/on-call ownership, or the team splits across multiple services, or a compliance
requirement forces isolation. Any such change must be a new ADR, not a silent drift.

## ADR-009 — Feature-module architecture for the organizer and participant cabinets

Status: Accepted.

Both cabinets (organizer dashboard, participant dashboard) will receive continuous new
features after MVP. To keep adding features from breaking existing ones, cabinet code is
organized as independent feature modules, not as shared mega-components with growing
branching logic.

Decision:

- each cabinet feature (e.g. "manage waitlist", "ride updates composer", "saved rides")
  lives in its own folder with its own components, data-fetching hooks, and tests;
- features register themselves into shared surfaces (dashboard navigation, widget areas)
  through a registry/config list, instead of being wired by editing a shared
  layout/switch component for every new feature;
- contracts shared across features (`packages/types`, `packages/ui`, the REST API) change
  additively by default — new optional fields/props/endpoints. Changing or removing an
  existing shared contract requires an explicit migration note in
  `docs/changelog.md` and, if it affects the API, a versioning decision (see
  `.claude/rules/extensibility.md`);
- new cabinet features ship behind a feature flag when there's any risk of an unfinished
  feature affecting the rest of the cabinet, so partial rollout doesn't require a rushed
  hotfix.

Full mechanics are in `.claude/rules/extensibility.md`. See also ADR-008: this is the same
"don't couple things that don't need to be coupled" philosophy applied to product features
inside the monolith, rather than to deployment topology.

## ADR-010 — Map provider behind a swappable adapter interface

Status: Accepted.

Even though 2GIS (ADR-003) is expected to remain the provider for the foreseeable future,
all map/geocoding/routing access goes through a provider-neutral interface
(`packages/maps-core`), with 2GIS as one concrete implementation
(`packages/maps-2gis`). No domain, API, or shared UI code imports the 2GIS SDK directly.

Rationale: this was already implied by the existing integration-boundary principle
(`docs/architecture.md`, `.claude/rules/maps.md`) — this ADR makes the adapter package
split explicit and mandatory so "swap 2GIS for another provider" is a matter of writing a
new adapter package and wiring it in, not a rewrite of ride/route/discovery features.

The full interface contract is defined in `.claude/rules/maps.md`.

## ADR-011 — REST API contract: versioning, pagination, error format

Status: Accepted.

Three contract-level decisions taken together, before the first endpoint exists, because
each of them is cheap now and a breaking change for every client later.

### 1. Versioning — path prefix `/v1`

Every application endpoint lives under `/v1` (`/v1/auth/login`, `/v1/rides`, …). A
backward-incompatible change introduces `/v2` for the affected endpoints; `/v1` keeps
working until every client is migrated, as required by `.claude/rules/extensibility.md`
("contracts change additively").

Operational endpoints are deliberately outside the versioned namespace: `/health`
(CR-051) is consumed by the deployment platform, not by product clients, and has no
reason to move when the product contract changes.

Why a path prefix and not a header/media-type scheme: it is visible in logs, cURL, and
proxy rules, and it survives a browser address bar. Header-based versioning buys
theoretical purity and costs debuggability on every single support request.

### 2. Pagination — cursor-based, on every collection

Every collection endpoint (`/v1/rides`, `/v1/rides/:id/participants`,
`/v1/rides/:id/reviews`, `/v1/rides/:id/updates`, and every collection added later)
accepts `?limit=` and `?cursor=` and returns:

```json
{ "items": [], "nextCursor": "opaque-string-or-null" }
```

- `limit` default 20, maximum 100 — the server clamps rather than erroring;
- `cursor` is opaque to the client: it encodes the sort key of the last returned row and
  must not be parsed or constructed client-side;
- `nextCursor: null` means the end of the collection.

Why cursor and not `offset`/`page`: the ride feed is sorted by start date and rides are
published continuously, so offset pagination silently skips and duplicates rows whenever
the underlying set shifts between requests. Offset also degrades on large skips, while a
cursor is an indexed range scan. This matters most on exactly the two lists that will grow
without bound — ride discovery and a popular ride's participant list.

### 3. Errors — RFC 9457 `application/problem+json`

Every non-2xx response uses one shape:

```json
{
  "type": "https://coffee-ride.example/errors/ride-full",
  "title": "Ride is full",
  "status": 409,
  "detail": "Human-readable, safe to show to the user.",
  "instance": "/v1/rides/42/register",
  "code": "ride_full",
  "errors": [{ "path": "startsAt", "message": "..." }]
}
```

- `code` is the stable machine-readable domain code clients branch on (`ride_full`,
  `duplicate_registration`, `registration_closed`, `not_owner`, …). `title`/`detail` are
  human-facing and may be reworded without it being a breaking change;
- `errors` is present only for validation failures (Zod issues), one entry per field;
- `detail` never contains a stack trace, SQL, driver text, or any other internal —
  `.claude/rules/backend.md`;
- auth endpoints keep their deliberately generic messages (`.claude/rules/security.md`:
  no account enumeration). A uniform error envelope does not mean a more informative one.

Why RFC 9457 and not a bespoke `{ ok: false, error }`: it is a published standard with an
existing meaning for `type`/`title`/`status`/`detail`, so no one has to invent or
re-document the envelope, and the `code`/`errors` extensions cover what the domain needs.

### What this does NOT mean

- It does not mean the API is public or has third-party consumers. `/v1` is about being
  able to change the contract without a coordinated big-bang deploy of web and future
  mobile clients, not about publishing an integration surface.
- It does not authorize a `/v2` per feature change. Additive change stays the default;
  `/v2` is the escape hatch for genuinely incompatible change.

### When to revisit

If a second client (mobile) ships and a real backward-incompatible need appears, revisit
how long `/v1` is kept alive and record the deprecation policy as its own ADR. Until then
there is exactly one version and no deprecation machinery to maintain.

## ADR-012 — Time is stored as `timestamptz`, and a ride carries its own IANA timezone

Status: Accepted.

Two rules, fixed before `packages/db` exists because both are painful to retrofit — the
first requires rewriting stored data whose original meaning is no longer recoverable, the
second requires guessing it.

### 1. Every point in time is `timestamptz`

All timestamp columns use `timestamptz` (`timestamp with time zone`). Plain `timestamp` is
not used anywhere in the schema. Postgres stores `timestamptz` normalized to UTC, so
comparisons, sorting, and `now()` filters are unambiguous regardless of the server's or
the client's zone.

Retrofitting is the whole point of deciding now: converting a populated `timestamp` column
later means deciding, per row, which zone the value was written in — and that information
does not exist anywhere by then.

### 2. A `Ride` additionally stores the IANA timezone of its start location

Example: `Asia/Krasnoyarsk`, `Europe/Moscow`. Russia spans eleven offsets, so "the ride
starts at 08:00" is only meaningful together with where it starts.

The instant (`startsAt`, `timestamptz`) answers "has it started yet"; the zone answers
"what does the organizer's 08:00 mean, and what should each participant see". Both are
needed:

- an organizer in Krasnoyarsk sets 08:00 local — that is the intent, and it must survive a
  future change to offset rules (Russia has changed them before, and per-region);
- a participant browsing from Moscow must see the ride's local start time labelled as
  local, not silently rendered in their own zone — showing "04:00" for an 08:00 ride is a
  bug report waiting to happen;
- reminders and "starts in 2 hours" are computed from the instant, not from the wall time.

Store the IANA identifier, never a fixed offset like `+07:00`: offsets expire, zone
identifiers survive tzdata updates.

### What this does NOT mean

- It does not mean every entity needs a timezone column. Only wall-clock intent tied to a
  place does — `Ride` (and `Stop`, if a stop ever gets its own scheduled wall time).
  `createdAt`/`updatedAt` are instants and need nothing beyond `timestamptz`.
- It does not mean rendering logic belongs in the database. Formatting stays in the shared
  Russian formatter module (`docs/design.md` §7, CR-064).

### When to revisit

If the product ever adds multi-day rides crossing a zone boundary, revisit whether a
finish-side zone is also needed. Not a concern for MVP.

## ADR-013 — Database-backed sessions, single origin with `/api` behind the proxy

Status: Accepted.

Resolves the part of ADR-006 left Pending (backlog item CR-062) and fixes the deployment
topology it depends on. Taken together because the cookie policy is only decidable once
the origin layout is known.

### 1. Sessions live in Postgres

A `Session` row holds: the SHA-256 **hash** of the session token (never the token itself —
a database dump must not hand over working sessions), `userId`, `createdAt`, `expiresAt`,
`lastUsedAt`, and `revokedAt`. The cookie carries only the opaque token.

- logout deletes the row; a password change revokes every session of that user; an
  account block takes effect on the next request;
- lifetime 30 days, rolling: `expiresAt` is extended at most once per day, not on every
  request — the "explicit expiry/refresh behavior" `.claude/rules/security.md` demands;
- Redis may cache a session lookup with a short TTL, but Postgres stays the source of
  truth and revocation invalidates the cache. Caching is an optimization to add when
  measurements justify it (ADR-004: "only when justified"), not part of the initial build.

Why not JWT: the deciding factor is revocation, not performance. This platform stores
participant contact and emergency data, so "log out everywhere" and "block this account"
have to take effect immediately. A JWT cannot be withdrawn before it expires, so it needs
a revocation list — which reintroduces exactly the server-side state JWT was supposed to
remove, in a second store, with two places to get wrong. One indexed lookup by primary key
is cheap; a subtly unrevokable session is not.

This keeps `apps/api` stateless in the process sense — session state is in Postgres, not
in memory — so it scales horizontally with no sticky sessions.

### 2. One origin; `/api` is reverse-proxied to Fastify

`example.com` serves Next.js; `example.com/api/*` is proxied to `apps/api`. Consequences,
all of them deliberate:

- **no CORS at all** — cross-origin browser access is not a supported configuration, and
  the API should not grow a permissive CORS policy "just in case";
- **cookie**: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. `SameSite=None` is not
  needed and must not be used;
- **CSRF**: `SameSite=Lax` plus an `Origin`/`Referer` check on every unsafe method
  (POST/PATCH/DELETE). This is the concrete mechanism `.claude/rules/security.md` requires
  to be decided and recorded at CR-012 — recorded here. A double-submit token is not
  required under a single origin and is not added preemptively.

### What this does NOT mean

- It does not forbid a future mobile client. A native app cannot use browser cookies the
  same way, and when one is actually built, a token flow for non-browser clients gets its
  own ADR. Not designing for it now is the point — ADR-008's philosophy applied to auth.
- It does not mean the API may only ever be reached through the web app's origin. It means
  that today there is exactly one browser origin, so CORS has nothing to permit.
- It does not preclude splitting web and API onto separate hosts later: the split that
  would hurt is the _origin_ split (cookies, CSRF), not the machine split. Two machines
  behind the same proxy hostname keep every property above.

### When to revisit

When a second first-party client ships (mobile), or if the web app ever has to be served
from a host that cannot proxy `/api` — for example a frontend platform that will not
forward a path prefix. Both are real reasons; "it feels cleaner to separate them" is not.
