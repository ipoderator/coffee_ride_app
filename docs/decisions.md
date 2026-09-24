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

Status: Accepted 2026-09-20 (CR-100) for the external-provider half — the
in-app half (CR-038/CR-039/CR-040/CR-041) was already built against this
ADR's first sentence.
Provider: Unisender Go (transactional email), for the verify-email/
password-reset links CR-099's web screens need to actually be reachable by
a real user. Behind an adapter (`apps/api/src/lib/email/{email-provider,
unisender-provider}.ts`) — no separate `packages/notifications-*` workspace
split like ADR-010's maps adapter, since only `apps/api` ever sends email
(one consumer, not two); swapping providers later means a new
`EmailProvider` implementation in that same directory, not a rewrite.
Delivery reuses CR-050's existing `notifications` BullMQ queue (two new job
types, `verification_email`/`password_reset_email`) rather than a parallel
mechanism — same async-side-effect/resilience discipline already built for
in-app notifications. `UNISENDER_API_KEY`/`EMAIL_FROM_ADDRESS` both optional
in `env.ts`: unset means `app.emailProvider` is `null` and every producer
no-ops, same degraded-mode shape as `app.s3`/2GIS — never a boot crash.

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

## ADR-014 — Geo query approach for map discovery: plain lat/lng columns, not PostGIS

Status: Accepted.

Resolves backlog item CR-084 ("Decide the geo query approach for map discovery: PostGIS
vs built-in types + index strategy"), decided together with CR-026 ("Map discovery")
rather than as a separate prior session — same precedent as ADR-013/CR-062 being decided
alongside CR-012.

### 1. Each ride's start point is two plain columns, not a PostGIS geography/geometry type

`rides.startLat` / `rides.startLng`: `numeric(9,6)`, nullable, each with a range CHECK
(`-90..90` / `-180..180` — `.claude/rules/database.md`: invariants enforced at the DB
level). No PostGIS extension, no `geography`/`geometry` column type.

### 2. Map-viewport (bbox) queries are plain range predicates, not a spatial index

`GET /v1/rides`'s optional bbox filter (`bboxNorth`/`bboxSouth`/`bboxEast`/`bboxWest`)
becomes `startLat BETWEEN bboxSouth AND bboxNorth AND startLng BETWEEN bboxWest AND
bboxEast`, backed by a plain composite B-tree index on `(startLat, startLng)`. No GiST
index, no `earthdistance`/`cube` extension.

### Rationale

- `docs/product.md`'s MVP scope (item 4, "map/list discovery") only needs markers
  within the current map viewport — a bbox query. No named use case for true radius/
  great-circle proximity search ("rides within N km of me") or a spatial join against
  a route polyline — the polyline itself doesn't exist yet (`Route`/`RoutePoint` are
  CR-027..031, unscheduled at the time of this decision).
- The current `docker-compose.yml` Postgres image is plain `postgres:17-alpine`.
  PostGIS is not installed, and installing it means a base-image swap — a real infra
  change with its own operational surface (extension management, image provenance),
  not something the current requirement justifies. Same "only when justified"
  discipline as ADR-004 (Redis) and ADR-005 (S3): don't add infrastructure ahead of a
  named need.
- A plain-degree bbox range query, index-supported by an ordinary B-tree, is a strict
  subset of what PostGIS/`earthdistance` offer and is sufficient for "show markers in
  the visible map area" at MVP scale. It also has no `packages/db`/Drizzle marshaling
  cost — Drizzle has no first-class PostGIS geography/geometry column helper, so a
  spatial type would need raw SQL column definitions and custom serialization, while
  `numeric` is already a first-class Drizzle type this codebase uses elsewhere
  (`distanceKm`, `paceKmh`).
- Known accuracy limitation, accepted for MVP: a degree of longitude covers less
  ground distance at high latitude than at the equator, so a plain-degree bbox
  slightly over-fetches near a viewport's north/south edges at high latitude (Russia
  spans a wide latitude range). Acceptable for "which pins show on the current map",
  not used for precise distance sorting or radius search — nothing in scope today
  does either.

### What this does NOT mean

- It does not add coordinates for a ride's finish point, stops, or route geometry —
  those remain unmodeled until the tickets that need them (CR-026 only adds the one
  point a discovery-map pin needs; `.claude/context/known-issues.md` tracks the finish-
  point gap explicitly rather than silently).
- It does not preclude true radius search, server-side clustering, or PostGIS later.
  Those are the trigger to revisit, not a reason to build the capability now.

### When to revisit

If the product ever names real radius/proximity search ("rides near me"), server-side
marker clustering at scale, or a spatial join against actual route geometry (once
`Route`/`RoutePoint` exist), that is the point to add `earthdistance`/`cube` (a
lightweight contrib extension, no base-image change) or, if a true polygon/line spatial
join is needed, PostGIS via a base-image swap — decided in a follow-up ADR, not a config
tweak.

## ADR-015 — GPX upload: size cap + streaming parse, no worker thread

Status: Accepted.

Resolves backlog item CR-085 ("GPX parsing must not block the event loop: size limit,
streaming or worker — needed by CR-027"), decided together with CR-027 ("GPX upload")
rather than as a separate prior session — same precedent as ADR-013/CR-062 and
ADR-014/CR-026.

### Decision

1. **Hard upload size cap.** `@fastify/multipart`'s `limits.fileSize` rejects any
   upload over 10 MB before a single byte reaches the GPX parser
   (`apps/api/src/app.ts`'s `GPX_MAX_UPLOAD_BYTES`). 10 MB is generous for a real ride
   track — even a 24-hour continuous recording at one point per second with
   lat/lon/elevation/time stays well under it.
2. **Streaming (SAX) parse, not a full-DOM parse.** `apps/api/src/modules/rides/
gpx.ts` uses the `sax` package's incremental event-based parser over the buffered
   upload, rather than a library that builds a complete in-memory parse tree first —
   no single call does work proportional to an unbounded document structure; work is
   already bounded primarily by (1)'s size cap.
3. **No worker thread.** The size cap already bounds worst-case synchronous work to a
   small, fixed amount at today's data scale (thousands of track points, not
   millions) — a worker thread adds process/IPC complexity `.claude/rules/
resilience.md`'s "only when justified" discipline doesn't support yet.

### Rationale

- `docs/product.md`'s MVP item 5 ("GPX route") only needs to accept and store one
  organizer-uploaded track per ride — no batch/bulk GPX processing, no server-side
  GPX generation, nothing that would make even a 10 MB cap a real constraint.
- A synchronous parse of a capped, few-megabyte XML document with a streaming parser
  completes in single-digit milliseconds — not the kind of event-loop-blocking
  concern a worker thread exists to solve. Revisit only if a real production
  perf problem is actually observed once route data exists at scale (e.g. many
  concurrent uploads of near-cap-size files), not speculatively.
- Consistent with ADR-014's own reasoning for deferring PostGIS: don't build
  infrastructure (a worker pool) ahead of a named, measured need.

### What this does NOT mean

- It does not mean any future heavy/bulk file-processing feature is automatically
  safe without a worker — this decision is scoped to a single-file, capped-size GPX
  upload specifically.
- It does not extract the size-cap/timeout/retry pattern into a shared utility —
  CR-049 ("Timeout/retry/circuit-breaker utilities for external integrations") is the
  ticket that generalizes this once a second consumer (2GIS, S3 cover images) needs
  the same shape; CR-027's `route-storage.ts` wrapper stays scoped to the `rides`
  module for now.

### When to revisit

If GPX file sizes or upload concurrency at production scale ever make parsing a
measured event-loop latency problem, or if GPX processing grows beyond "parse one
uploaded file into a geometry array" (e.g. server-side track simplification,
batch reprocessing), reconsider a worker-thread offload then — not speculatively now.

## ADR-016 — Timeout/retry/circuit-breaker utility as a shared package (`packages/resilience`)

Status: Accepted.

Resolves backlog item CR-049 ("Timeout/retry/circuit-breaker utilities for external
integrations"), anticipated but explicitly deferred by CR-007 (`packages/maps-2gis`'s
timeout-only `fetchJson`) and CR-027 (`route-storage.ts`'s ad hoc, module-scoped
`withResilience`) — both left a comment pointing at this ticket as the generalization
point once a second consumer needed the same shape (ADR-015's "What this does NOT
mean").

### Decision

1. **A new workspace package, `packages/resilience`**, not a copy-pasted helper per
   integration. It exports `callWithResilience` (timeout via `AbortSignal`, bounded
   retry with jittered exponential backoff, records success/failure on an optional
   shared `CircuitBreaker`) and `CircuitBreaker` (closed → open after N consecutive
   failures → half-open single trial call after a cooldown → closed on trial success).
   Pure TypeScript, zero runtime dependencies — same shape as `packages/maps-core`
   (provider-neutral interface, no vendor coupling), except here there is no vendor to
   be neutral about; it doesn't know `fetch` or the AWS SDK exist, it just drives an
   `AbortSignal` and calls a passed-in `operation`.
2. **One breaker instance per integration, not per call.** `create2GisMapProvider`
   builds one `CircuitBreaker` shared across `geocode`/`reverseGeocode`/`getRoute`;
   `route-storage.ts` builds one module-level breaker shared across
   upload/download/delete. A breaker tracks "is this provider degraded", which is a
   property of the integration as a whole — a run of failing geocode calls should also
   short-circuit `getRoute` against the same struggling provider, not track each
   method's health independently.
3. **`ResilienceError` never crosses an integration's boundary.** Each call site
   (`packages/maps-2gis/src/http.ts`, `route-storage.ts`) catches it and normalizes into
   its own existing domain error (`MapProviderError`, `RouteStorageError`) — no caller
   of `MapProvider` or the route-storage functions sees a new error type or has to
   change its `catch` blocks. This was a hard constraint, not a nice-to-have: both call
   sites already have established downstream fallback behavior (`rides.service.ts`'s
   degraded-storage response, `MapProviderError`'s documented "caller decides the
   fallback" contract) that this change must not disturb.
4. **New allowed dependency edges**: `apps/api → resilience` and
   `packages/maps-2gis → resilience` (`.claude/rules/architecture.md`). `apps/web` has
   no external-integration call site of its own today and gains no dependency on it.

### Rationale

- Two real, independently-written implementations of "timeout + bounded retry" already
  existed (`fetchJson`'s timeout-only version, `route-storage.ts`'s timeout+retry
  version) and neither had a circuit breaker — exactly the duplication-risk both
  call sites' own comments flagged in advance. A third integration (a future
  notification provider, ADR-007) would have been a third hand-rolled copy without this
  ticket.
- A circuit breaker specifically needs to be _shared_ state across calls to mean
  anything — a per-call or per-request instance can never observe "N consecutive
  failures" the way a module-level singleton can. That requirement (shared, long-lived
  state) is what makes this a real package with an explicit composition point per
  integration, not a stateless helper function copy-pasted around.
- Kept deliberately small: no configurable retry-on-status-code policy, no
  distributed/Redis-backed breaker state (every `apps/api` instance today is a single
  process — ADR-008), no metrics/observability hook. `.claude/rules/resilience.md`'s
  "only when justified" discipline — add those when CR-051 (health checks) or real
  multi-instance deployment (CR-075) actually needs them, not speculatively.

### What this does NOT mean

- It does not change either integration's documented fallback behavior — 2GIS failures
  still let the ride be created/viewed without geocoded coordinates, S3 failures still
  surface as a degraded-storage response, not a generic 500. This ticket only replaces
  _how_ the timeout/retry/breaker mechanics are implemented underneath those fallbacks.
- It does not retry non-idempotent operations. `route-storage.ts`'s PUT/GET/DELETE by
  key and 2GIS's geocode/reverseGeocode/getRoute (a stateless calculation, even over
  POST) are all safe to retry; nothing in this codebase currently calls
  `callWithResilience` around a mutating, non-idempotent operation, and doing so would
  be a misuse of the utility, not a use case it's designed for.

### When to revisit

If a future external integration needs retry behavior this utility doesn't support
(e.g. respecting a provider's `Retry-After` header, retrying on specific 5xx codes but
not others), extend `packages/resilience` itself rather than building a parallel
mechanism next to it — the whole point of this ADR is that there is one place this
logic lives.

## ADR-017 — `apps/api`'s production build bundles workspace source with `esbuild`

Status: Accepted.

Resolves KI-017 (`.claude/context/known-issues.md`): `packages/db`/`packages/types`
ship `main`/`types`/`exports` pointing at raw `.ts` source, which `tsx` (dev, tests)
and `tsc` (typecheck) resolve fine but a plain `node dist/server.js` cannot — `db`'s
compiled `client.ts` imports its sibling `schema/index.ts` with a `.js`-suffixed
NodeNext-style specifier that Node's native `.ts` type-stripping loads literally
without rewriting, crashing with `ERR_MODULE_NOT_FOUND`. Confirmed live and blocking
since CR-011 (first real runtime consumer of `db`/`types`); left undecided until now
since nothing needed a real compiled boot before CR-074 (Dockerfile).

### Decision

1. **`apps/api`'s own `build` script switches to `esbuild`** (`apps/api/scripts/
build.mjs`), bundling `src/server.ts` plus the source of every workspace package it
   actually depends on (`db`, `types`, `resilience`) into one `dist/server.js`. Every
   real npm dependency (`fastify`, `drizzle-orm`, `postgres`, `argon2`, `bullmq`,
   `ioredis`, `@aws-sdk/client-s3`, `sax`, `zod`, the `@fastify/*` plugins) stays
   external — resolved from `node_modules` at runtime exactly as today, never inlined.
   Bundling a native addon (`argon2`) would be a real footgun, not just unnecessary
   work.
2. **`db`/`types`/`maps-core`/`maps-2gis`/`resilience` are untouched** — their
   `package.json` `exports` keep pointing at raw `.ts` source, and their own `tsc`-based
   `build` scripts are unchanged. `tsx watch`/`vitest` (every consumer's dev/test path,
   not just `apps/api`'s) never read `dist/` and are provably unaffected — the full
   `apps/api` test suite (283 tests) and `apps/api`'s `tsx watch` dev flow both work
   identically before and after this change.
3. **`external` is computed from the union of `dependencies` across `apps/api` +
   every bundled workspace package, minus those workspace package names** — not just
   `apps/api`'s own `package.json`. A workspace package's own runtime dependency (e.g.
   `db`'s dependency on `postgres`) isn't otherwise visible to `apps/api` at all today.
   This surfaced a second, real gap while implementing it (not hypothetical): marking
   `postgres` external in the bundle wasn't sufficient by itself — pnpm's strict,
   non-hoisted `node_modules` only symlinks a package's _own_ declared dependencies
   into its `node_modules`, so a plain `node dist/server.js` still couldn't resolve
   the bare `postgres` specifier until `apps/api/package.json` declared it directly.
   `apps/api` now lists `postgres` as a direct dependency even though no file under
   `apps/api/src` imports it — the bundle does, once `db`'s source is inlined, which
   makes it a genuine runtime dependency of this app now, not a phantom one.

### Rationale (why a bundler, not declaration-based `dist` exports)

The alternative KI-017 itself named — switching `db`/`types` to real `dist` exports
(`"main"/"exports"` pointing at compiled output, `"declaration": true`) — would require
every dev/test consumer of those packages to keep resolving to fresh source, not a
stale prior build, meaning either a dual source/dist export condition (real ongoing
complexity on a path — dev/test — that already works correctly) or a mandatory build
step wired into every dev/test invocation across the whole monorepo. Bundling only
`apps/api`'s own production build touches nothing about how `db`/`types`/`maps-2gis`
ship to anyone else; it fixes the one broken consumption path without adding
maintenance surface to the ones that already work.

### What this does NOT mean

- It does not change `db`/`types`/`maps-core`/`maps-2gis`/`resilience`'s own package
  shape, `exports`, or `build` scripts — this ADR is scoped to `apps/api`'s own
  production artifact only.
- It does not mean bundling third-party npm dependencies. Every real npm package stays
  external by design — bundling `argon2` (a native addon) or `@aws-sdk/client-s3`
  would trade a known-broken module-resolution problem for a differently-broken native-
  binding/bundling problem.
- It does not mean `apps/web` needs the same treatment — its equivalent problem
  (webpack, not plain `node`, resolving `types`' `.js`-suffixed relative imports) was
  already fixed differently (`next.config.ts`'s `resolve.extensionAlias`, CR-011) and
  is unaffected by this ADR.

### When to revisit

If a fourth workspace package (e.g. `maps-2gis`, once something in `apps/api` actually
consumes it) needs bundling into `apps/api`'s production artifact, add it to
`WORKSPACE_PACKAGES` in `apps/api/scripts/build.mjs` — the `external` computation
already unions in whatever `dependencies` that package declares, so the only manual
step is adding its name to that list. If `apps/web` or another app ever needs its own
compiled-production-boot fix, decide fresh whether bundling or declaration-based
`dist` exports fits its actual constraints — don't assume this ADR's answer transfers
without checking.

## ADR-018 — Reverse proxy: Caddy, terminating TLS in front of `apps/web` only

Status: Accepted.

CR-075 (`docs/tasks.md` Deployment section): the two CR-074 application images need a
real "production manifest" — something that puts them on one public origin (ADR-013)
with TLS, sane restart behavior, and resource limits. `docs/architecture.md` calls a
reverse proxy choice a "production provider choice" that "must be recorded as ADRs" —
recorded here.

## ADR-019 — Cover image pipeline: size/type limits, resize bound, API-proxied serving

Status: Accepted.

Resolves backlog item CR-086 ("Cover image pipeline: size/type limits, resizing, how
files are served (direct S3 vs proxy) — needed by CR-017"), decided together with
CR-086's implementation rather than as a separate prior session — same precedent as
ADR-014/CR-026 and ADR-015/CR-027.

### Decision

1. **Accepted types, verified by decoding, not by trusting the client.** JPEG, PNG,
   WebP. `apps/api/src/modules/rides/cover-image.ts` hands the uploaded buffer to
   `sharp` and reads back the format `sharp` itself detected — an upload whose actual
   bytes aren't one of these three is rejected (`400 cover_image_invalid`) regardless
   of what `Content-Type`/filename extension the client sent
   (`.claude/rules/security.md`: never trust client input). SVG is deliberately not
   accepted — an SVG can embed `<script>`/`foreignObject` content, a known image-upload
   XSS vector, and gains nothing a raster cover photo needs.
2. **8 MB upload cap**, smaller than GPX's 10 MB (ADR-015) — enforced the same way,
   `@fastify/multipart`'s per-call `limits.fileSize` override on `request.file(...)`
   (`readCoverImageUpload`, mirroring `readGpxUpload`). Generous for a real exported
   phone/camera photo, small enough to bound the resize step's worst-case work.
3. **Resize, don't crop.** `sharp(buffer).rotate().resize({ width: 1920, height: 1920,
fit: 'inside', withoutEnlargement: true })` — bounds storage/bandwidth to a sane
   maximum without upscaling a smaller image, and `.rotate()` with no argument bakes in
   the EXIF orientation tag before it's discarded. The original format is kept (no
   forced re-encode to one canonical format) and no crop/aspect ratio is applied — a
   deliberate scope limit: `docs/design.md` §14 explicitly lists "cover-image aspect
   ratio and crop behavior" as still open, pending a real photo sample. `RideCard`/
   `RideDetailView` already crop to their container via CSS `object-cover` (CR-048),
   independent of the stored image's own ratio — this decision must not preempt that
   still-open design question by baking in a server-side crop.
4. **Metadata is stripped**, not preserved — `sharp`'s default behavior once `.rotate()`
   has already consumed the EXIF orientation tag it needs. Incidental but real privacy
   benefit: phone photos routinely carry GPS EXIF tags that would otherwise leak an
   organizer's (or a ride's start location's) precise coordinates through a "just a
   cover photo" upload.
5. **Served via API proxy** (`GET /v1/rides/:id/cover`), the same shape as `GET
/v1/rides/:id/route/download` (ADR-015/CR-027) — not a direct S3/MinIO URL. The
   object stays behind `apps/api/src/plugins/s3.ts`'s existing private bucket
   credentials; nothing needed a bucket ACL/policy change. The returned `coverImageUrl`
   is a same-origin relative path, so `next/image` needs no `images.remotePatterns`
   entry either (that config is only for cross-origin `next/image` sources) — this
   corrects speculative comments already left in `RideCard.tsx`/`RideDetailView.tsx`
   anticipating a remote-pattern addition; those are updated alongside this decision.
6. **DB:** `rides.cover_image_url` (text, added at CR-017, never actually populated) is
   renamed to `rides.cover_image_key` — an S3 object key, same naming convention as
   `routes.gpx_file_key` — plus new nullable `cover_image_content_type`/
   `cover_image_size_bytes` columns. The public API field name (`coverImageUrl` on
   `GetRideResponse`) is unchanged; it's now computed from the key at response time
   (`/v1/rides/:id/cover`) instead of stored verbatim.
7. **Scope: `Ride` only.** KI-023 also names `User`/`OrganizerProfile` avatars as
   wanting the same pipeline — the storage (`cover-image-storage.ts`) and resize
   (`cover-image.ts`) helpers are written generically (parameterized by S3 key/prefix,
   no `rides`-specific assumptions baked into either), so a later ticket can reuse them
   for an avatar upload endpoint without rebuilding this decision — but wiring actual
   `User`/`OrganizerProfile` endpoints is explicitly out of this CR's scope.

### Rationale

- Reuses the exact resilience/ownership/draft-only/viewer-visibility patterns
  `.../route` already established (ADR-015, CR-027/028) rather than inventing a second
  file-upload shape — one pattern for "the app stores and serves an organizer-uploaded
  file", not two.
- Proxy-over-direct-S3 keeps the "everything bound to 127.0.0.1, no public bucket"
  posture this project has held since `docs/decisions.md`'s Docker Compose port
  decisions (CR-072) — a public-read bucket/CDN is a real, separate infrastructure
  decision this ticket doesn't need to make to satisfy CR-017's actual requirement (the
  ride detail/card screens showing a photo).
- Resize-only (no crop) avoids the trap of two independent tickets each half-deciding
  the same open design question (`docs/design.md` §14) from different layers.

### What this does NOT mean

- It does not mean the bucket can never become public/CDN-fronted — if image-serving
  load ever becomes a measured problem at the API layer, that is a real infrastructure
  decision (new ADR), not a default this one already picked.
- It does not extend this pipeline to `User`/`OrganizerProfile` avatars — KI-023 stays
  open for that follow-up work specifically, even though the low-level helpers are
  already reusable.
- It does not settle cover-image aspect ratio/crop behavior — that remains explicitly
  open in `docs/design.md` §14 until a real photo sample exists.

### When to revisit

If image-serving load through the API ever becomes a measured bottleneck, or once
`docs/design.md` settles a real aspect ratio/crop behavior (at which point a
server-side crop step could be added to `cover-image.ts`), or when the `User`/
`OrganizerProfile` avatar follow-up (KI-023) is picked up and needs to decide whether
to reuse this proxy shape as-is.

### Decision

1. **Caddy 2** is the reverse proxy, not nginx+certbot or Traefik. One `deploy/
Caddyfile`, one site block: `reverse_proxy web:3000`. Caddy's automatic HTTPS
   (ACME/Let's Encrypt, obtained and renewed with no separate process) is the reason —
   nginx would need a second container (certbot) plus a shared volume and a renewal
   cron/timer wired correctly, which is exactly the kind of extra moving part
   `docs/architecture.md`'s "prefer boring, explicit architecture" rule warns against
   when a simpler option does the same job. Traefik was not chosen either: its value is
   dynamic service discovery across many/changing containers, and this topology is two
   fixed services — the added label-based configuration surface buys nothing here.
2. **Caddy only ever proxies to `web`, never directly to `api`.** `apps/web/
next.config.ts`'s `rewrites()` (built and working since CR-011) already forwards
   same-origin `/api/v1/*` requests to `API_INTERNAL_URL` server-side inside the `web`
   container. Routing `/api/*` a second time at the Caddy layer would duplicate that
   logic in two places for no benefit — one composition point for the path split,
   already tested, stays the only one. `docker-compose.prod.yml` reflects this: `api`
   publishes no host port at all, reachable only from `web` over the compose network.
3. **Resource limits and restart policy are plain Compose fields, not Swarm's `deploy:`
   block** — `restart: unless-stopped` (top-level, per service) plus `deploy.resources.
limits.cpus`/`memory` (Compose V2 applies this outside Swarm mode too, unlike
   `deploy.restart_policy`, which Compose silently ignores without `docker stack
deploy` — a well-known footgun worth naming explicitly here so a future edit doesn't
   "simplify" restart handling into the Swarm-only field by mistake).

### What this does NOT mean

- It does not decide where Postgres/Redis/S3 run in production. `docker-compose.
prod.yml` deliberately does not start them — it assumes `DATABASE_URL`/`REDIS_URL`/
  `S3_*` already point at real, externally provisioned endpoints. `docs/
architecture.md`'s "production provider choices... must be recorded as ADRs" stays
  open for those three; conflating "here's a reverse proxy for the two app images"
  with "here's how Postgres is hosted in production" would be a second, unrelated
  decision smuggled into this one.
- It does not run migrations. CR-076 ("migrations as an explicit deploy step... never
  on application boot") owns that, and is still unbuilt — adding a migration step to
  this compose file now would ship exactly the multi-instance race CR-076 exists to
  prevent.
- It does not harden Redis (KI-003) or add Postgres backups (KI-078/CR-078) — both stay
  scoped to their own tickets, not folded into "the production manifest" just because
  they're also Deployment-section work.
- It does not claim to have been run. Docker's daemon is unreachable in this
  environment (KI-019) and Caddy's ACME challenge needs a real public DNS record
  pointing at a real host regardless — neither is verifiable in any local/CI sandbox.
  See `.claude/context/known-issues.md` (KI-043 extended) for exactly what was and
  wasn't checked instead.

### When to revisit

If a second first-party origin/service needs routing (mobile API gateway, a separate
admin app), reconsider Traefik's dynamic-discovery model then — not preemptively now.
If `/health`/`/docs` ever need to be reachable from outside the compose network
directly (bypassing `web`), add an explicit Caddy route for them and give `apps/api`
a `trustProxy` setting at that point — today they're only ever called from inside the
compose network (Docker healthchecks, `web`'s own dev-time Swagger link), so trusting
proxy headers on `apps/api` was deliberately left alone.

## ADR-020 — Live MapGL rendering: render-layer types in `maps-core`, one composition point in `apps/web`

Status: Accepted.

CR-098 (`docs/tasks.md`): a real public `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` now exists,
making `packages/maps-core`'s `MapProvider` interface comment ("Web-only rendering
surface... not added yet... adding an unused rendering surface now would be
speculative") no longer true (KI-031). This records the design that comment was
deferring.

### Decision

1. **Render-layer types live in `packages/maps-core/src/render.ts`, separate from
   `provider.ts`'s server-safe `MapProvider`.** `MapMarkerInput`/`MapRenderOptions`/
   `MapHandle`/`MapRenderer` — provider-neutral (only this package's own `LatLng` plus
   ordinary browser `HTMLElement`, never a 2GIS/vendor SDK type), same ADR-010 boundary
   `MapProvider` already keeps. Kept as a separate interface rather than added to
   `MapProvider` itself, since server code never renders a map and should never see a
   render method on the interface it depends on.
2. **`packages/maps-2gis/src/render.ts` implements it against the real `@2gis/mapgl`
   npm package** (a genuine vendor SDK dependency, unlike `provider.ts`'s plain-`fetch`
   REST calls) — dynamically imported inside `render()`, so importing this module has
   no side effect and no `window`/DOM dependency outside a real browser call. MapGL's
   own coordinate convention (`[longitude, latitude]`, confirmed against the SDK's
   shipped type declarations) is converted at this one boundary, not by every caller.
3. **Exactly one composition point in `apps/web`** (`src/lib/maps/create-map-renderer.ts`)
   is allowed to import `maps-2gis` directly, per `.claude/rules/architecture.md`'s
   already-stated "one composition point ... to wire the concrete adapter" rule —
   this ticket is what actually builds that point for the first time. CR-056's
   `no-restricted-imports` `*2gis*` ban in `apps/web/eslint.config.mjs` also matches the
   bare workspace specifier `maps-2gis` (not just a vendor SDK name), so a narrowly
   `files`-scoped override was added for exactly this one file rather than relaxing the
   rule globally.
4. **Missing key or a failed render falls back to the existing degraded `ErrorState`
   notice** (`docs/design.md` §10), never a blank panel — `RideMapPlaceholder` is kept,
   not deleted, and now serves purely as that fallback.

### What this does NOT mean

- It does not wire the route-detail map (`RouteMapPlaceholder`, `RoutePoint`/`Stop`/
  polyline rendering) — that stays KI-036's open follow-up, deliberately not widened
  into this ticket.
- It does not decide marker clustering at city zoom (`docs/design.md` §15, still an
  open product question pending real ride density) or add any click-to-select
  interaction on a marker (would need a keyboard/list equivalent per §12 — out of
  scope until such an interaction is actually built).
- It does not change `MapProvider` (geocode/reverseGeocode/getRoute) at all — that
  interface and its one real consumer path (still zero callers, KI-032) are untouched.

### When to revisit

When the route-detail map is built (KI-036), reuse this same `MapRenderer` interface
rather than inventing a second one — if it turns out to need capabilities this MVP
interface doesn't have (a polyline layer, typed marker icons), extend
`packages/maps-core/src/render.ts` additively, the same discipline
`.claude/rules/extensibility.md` already applies to shared contracts.

## ADR-021 — Visual direction: «Топокарта» replaces Calm/Quiet Instrument

Status: Accepted (2026-09-23).

### Context

The visual direction until now was never an ADR of its own: `docs/design.md` §1's
"calm, low-saturation" palette with one muted teal accent (CR-063), extended by CR-107's
"Quiet Instrument" pass (glass panel over cover photos, a Golos wordmark). The
`/impeccable critique apps/web` run of 2026-09-23 (no snapshot stored — the owner
asked for a read-only review) scored the interface 21/40: legible and accessible, but generic — nothing in it said
"group rides on a route". The product owner reviewed alternatives in a shape brief and
chose «Топокарта»: the interface as a printed orienteering-map sheet. Recorded as an ADR
because the palette, type and shape rules are a cross-cutting contract every screen and
the map adapter's colour wiring now assume.

### Decision

1. **Paper, ink, one overprint.** White paper (`bg`), black ink (`text`, the new `frame`
   rule) and a single plum overprint colour (`primary`/`route`) used only for the ride's
   route line and the primary action. The other map inks carry meaning only: brown
   `contour` = elevation, blue `info`, green `success`, yellow `warning`/`warning-fill`.
   Dark theme is the same sheet "under a head torch" — neutral graphite, not violet.
   Exact values and verified WCAG ratios: `docs/design.md` §3.
2. **`danger` is unchanged** (`#D42B20`/`#FF5A4F`) and keeps §1's exception: cancellation,
   destructive actions and validation errors. In-page destructive buttons become a
   danger outline; the red fill is kept for `ConfirmDialog`'s confirm button
   (`Button`'s new additive `danger-filled` variant).
3. **Cards have no fill.** `bg-raised` now equals `bg` (the paper); the new `surface`
   token (sheet margin) is the one raised plane — dialogs, sticky bar, hover/selected
   rows. No shadows on cards; one small overlay shadow.
4. **Type:** Golos Text stays the body/UI face; Sofia Sans Condensed (`font-display`) is
   added for headings, labels, metric numerals and the wordmark. Its Russian Cyrillic
   forms come from `locl` and require `<html lang="ru">`, which is now a documented
   invariant of `app/layout.tsx`.
5. **Shape:** 4px "printed stamp" radius on buttons/inputs/chips (not pills), 6px on
   cards/dialogs; 2px `primary` focus ring with 2px offset unchanged; primary actions
   48px tall on mobile, 44px from `md`.
6. **Wordmark** «coffee◦ride» (Sofia Sans Condensed 700, ink, the dot replaced by a plum
   ring) and a ring-only SVG favicon.
7. **Token names are kept** (`.claude/rules/extensibility.md`: contracts change
   additively); new tokens are `surface`, `frame`, `primary-hover`, `primary-tint`,
   `route`, `route-casing`, `contour`, `warning-fill`, `on-warning-fill`, `info-tint`.

### Consequences

- Every screen changes appearance at once (tokens are app-wide), before the screen
  rebuilds (CR-118…CR-120) land; until then some screens keep layout patterns written for
  the old direction (e.g. a filled plum segmented-toggle state) and are fixed there.
- CR-107's glass tokens are retired: `glass-bg`/`glass-border` resolve to the opaque
  `surface`/`border` and `GLASS_PANEL_CLASSNAME` lost its `backdrop-blur`. The names stay
  only while the two flag-gated consumers (`FEATURE_COVER_GLASS_PANEL`,
  `FEATURE_STICKY_REGISTRATION_CTA`, both off by default) reference them; delete them
  with those call sites. `scrim` stays as a legibility wash over photos.
- Map colours: `RouteMap`/`RouteBuilder` draw the route as `route` over `route-casing`,
  6px, still resolved from tokens at call time (`docs/design.md` §14,
  `.claude/rules/maps.md`); the elevation profile is drawn in `contour`.
- One more webfont (Sofia Sans Condensed, variable, Cyrillic + Latin subsets).
- The favicon repeats the two `primary` hex values (a static SVG cannot read CSS
  tokens); it must be kept in step with `tokens.css` by hand.

### What this does NOT mean

- It does not introduce a second accent: `route` is the same overprint ink as `primary`,
  tuned for a line on a basemap.
- It does not relax "color never carries meaning alone" (§12) or any AA requirement.
- It is not a licence for map-themed decoration (contour-line backgrounds, paper
  textures, khaki/cream tints, serif faces) — the direction is the discipline of a
  printed map, not its costume.

### Rollback

Purely presentational, no data or API impact: revert `packages/ui/src/tokens.css`,
`apps/web/src/app/layout.tsx` (font), `packages/ui`'s `Button`/`ConfirmDialog`/
`StatusBadge`/`Wordmark`/`glass.ts` and `app/icon.svg` to their pre-CR-115 versions. The
token names are unchanged, so no consumer needs touching on the way back; the few
additive tokens (`surface`, `route`, ...) would need a fallback mapping if their new
consumers stay.

## ADR-022 — Pace groups: `RideGroup` as a new domain entity

Status: Accepted (2026-09-23).

### Context

The product owner added pace groups to the «Топокарта» scope (CR-117): a group ride
often splits by speed — e.g. three groups averaging 25, 30 and 35 km/h — and each
participant rides with exactly one of them. `.claude/CLAUDE.md` fixes the domain entity
list and forbids "duplicate concepts under different names", so a new entity needs a
recorded reason, not just a migration.

### Decision

1. **`RideGroup` is a new domain entity** (table `ride_groups`, added to the fixed list
   in `.claude/CLAUDE.md`): `rideId` (cascade), `name` (1–60, unique per ride
   case-insensitively), `paceKmh` (5–60, CHECK), `description` (≤500, nullable),
   `position` (dense `0..n-1`, unique per ride), timestamps + `updatedBy`. At most 6
   per ride, enforced in the service under the `rides` row lock.
2. **`Registration.groupId` / `WaitlistEntry.groupId`** (nullable) reference it through
   a **composite FK `(group_id, ride_id) → ride_groups(id, ride_id)`**, so the database
   itself guarantees a participant's group belongs to the same ride. On delete it is
   `NO ACTION` rather than `RESTRICT`: both refuse deleting a referenced group, but
   `NO ACTION` is checked at end of statement, so deleting a whole ride (which cascades
   to both tables) works regardless of cascade order.
3. **Rules live in the existing atomic registration transaction**: once a ride has any
   group, register/waitlist require `groupId` (`422 group_required`); it must be one of
   that ride's groups (`422 group_not_found`); capacity stays ride-level. A waitlist
   entry's group is carried into the registration a promotion creates. Deleting a group
   is refused (`409 group_has_registrations`) while an active registration or waiting
   entry points at it; historical rows lose their `groupId` instead.
4. **Groups stay editable after publishing** (any status but `finished`/`cancelled`),
   unlike stops/route points (draft-only) — organizers split or rename groups once they
   see who signed up.

### Rationale — why not an existing entity

- **Not a `Stop` / `RoutePoint`**: those are places on the route; a group has no
  location and is chosen by people, not placed on a map.
- **Not a `RideRequirement`**: a requirement is a rule every participant must meet
  ("helmet", "≥ 28 km/h"). A group is one of several mutually exclusive options that a
  registration points _at_ — it needs its own identity (id), a per-ride order, and a
  foreign key from `Registration`. Modelling it as a requirement would either lose the
  choice or overload one concept with two meanings, which is exactly the duplicate-
  concept problem the entity list exists to prevent.
- **Not a field on `Ride`** (e.g. a pace array): registrations must reference a group
  durably (rename/reorder must not change who is in which group) and the DB must be
  able to enforce "same ride" — both need a row with an id.

### What this does NOT mean

- No per-group capacity, leaders, or start times in this iteration — capacity stays
  `Ride.participantLimit`. Adding a nullable per-group limit later is additive.
- `Ride.paceKmh` is not removed or derived from groups; it stays the organizer's
  single headline pace for rides without groups.
- The public rider list (`GET /v1/rides/:id/riders`) exposes display name + group only,
  to signed-in users — not a general participant directory.

### When to revisit

If organizers ask for per-group limits/waitlists or per-group start times, or if more
than 6 groups per ride turns out to be a real need.

## ADR-023 — Rider profile: cross-participant access always scoped through a shared ride, three-tier visibility

Status: Accepted (2026-09-24).

### Context

The product owner asked for participant profile cards: from a ride's riders list,
open another participant's card and see their bio, "garage" (bikes), self-reported
distance stats, and recent rides — a step toward the platform feeling social. This is
the first feature where one user's data is shown to another. `.claude/context/
project-state.md` had already recorded a standing constraint from KI-059's discovery:
do not add a general `GET /v1/users/:id` without a real product reason. This is that
reason, but the shape still had to avoid becoming a general participant directory —
`.claude/rules/security.md` (no endpoint exposes another user's row) and `docs/
product.md`'s "no social feed" scope note both cut against an unscoped profile-by-id
endpoint.

### Decision

1. **No `GET /v1/users/:id`, ever.** Instead, two new routes nested under the ride/
   rider a viewer already reached through the (already signed-in-only) riders list:
   `GET /v1/rides/:id/riders/:registrationId/profile` and `.../avatar`. `GET /v1/
rides/:id/riders` additively gained `registrationId` per item (an opaque id, never
   a raw `userId`) — the only way to obtain one.
2. **Three-tier `profileVisibility`** on `User` (`closed` / `co_participants` /
   `open`, default `co_participants`), settable only by the profile's own owner via
   the existing `PATCH /v1/users/me`. `co_participants` is checked by "does the viewer
   have their own active registration on _this_ ride" — sharing the specific ride the
   card was opened from, not a search across the viewer's whole ride history.
3. **One access function, `resolveRiderAccess`**, backs both new routes so the tier
   logic exists exactly once. It always re-checks `Ride.participantsVisible` first
   (`403 riders_hidden`, same as the riders list itself) before considering
   `profileVisibility` at all — a rider list the organizer hid is hidden completely,
   not just thinned to "closed" profiles.
4. **The ride's own organizer always has access**, on top of the visibility tiers —
   they already have equal-or-greater access to the same participant via `GET .../
participants` (which includes contact data this new route never does), so this is
   not a new escalation.
5. **`phone`/`email` are never part of the response**, regardless of
   `profileVisibility` — the query behind the profile route does not select them at
   all, not just omit them at serialization. Only `bio`, `avatarUrl`, `bikes`,
   `distanceWeekKm`/`distanceMonthKm`/`distanceYearKm`, and `recentRides`.
6. **Distance stats are self-reported**, not derived from the participant's actual
   ride history — confirmed explicitly with the product owner. `recentRides` (up to 5,
   most recent first) reuses `Ride.participantsVisible` as its one visibility rule
   (a ride the organizer hid never appears in anyone's "recent rides" either) rather
   than inventing a second flag.
7. **`Bike`** ("garage") is a new domain entity (`packages/db/src/schema/bike.ts`,
   `user_bikes` table) — `userId`, `bikeType` (reuses `Ride`'s existing
   `bicycleTypeEnum`, narrowed at the app layer to exclude `'any'`), `brand`, `model`,
   `isActive` (DB-enforced: at most one active bike per user, partial unique index).
   Not a duplicate of any existing concept — a participant's personal equipment is
   genuinely new, unlike `RideRequirement` (a rule the ride imposes).

### Rationale — why ride-scoped, not a general profile-by-id endpoint

A general `GET /v1/users/:id` would need its own, independent authorization check
disconnected from any specific ride — inviting exactly the kind of "just check if the
id exists" shortcut `.claude/rules/security.md` warns against, and turning the app
into a browsable user directory (explicitly out of scope, `docs/product.md`). Scoping
through `registrationId` means the _only_ way to reach a card is a ride the viewer
already legitimately saw the riders list of, and the access check has natural,
narrow inputs (this ride, this rider, this viewer) rather than "any user, any user".

### What this does NOT mean

- No cross-ride "people you may know" or follow/friend graph — `co_participants`
  is evaluated per ride at request time, not a stored relationship.
- No profile search or public directory — a card is only reachable via a ride's own
  riders list link.
- Avatar streaming (`.../avatar`) duplicates the same gate rather than being a
  separately-securable resource — it is not safe to leave less protected than the
  profile JSON it illustrates.

### When to revisit

If a real product need appears for viewing a profile independent of any shared ride
(e.g. organizer-to-past-participant outreach), that is a new, separately-considered
decision — not a quiet loosening of `resolveRiderAccess`.

## ADR-024 — Visual direction: «Ночной старт» replaces «Топокарта»

Status: Accepted (2026-09-24).

### Context

The product owner commissioned a second-round visual exploration ("Ночной старт" /
"Night Start" — v2, the mockup is a real system: four key screens, components, states,
night/day tokens, a rollout plan). It targets people who ride before dawn: dark by
default, a route-drawn cover on every ride instead of a flat placeholder, larger
tabular numerals. Approving it means superseding ADR-021 wholesale, not just its
colour: «Топокарта»'s "printed stamp" 4px shape, map-first discovery and the
CR-108 header-only organizer nav all changed too, each confirmed explicitly with the
product owner rather than assumed from the mockup alone:

- The mockup's colour (`#82668C`/`#B8A0C1`) replaces CR-124's locked
  `#9033A1`/`#D79BE0` — a deliberate supersession of a same-day lock, not a drift.
- Discovery returns to a card grid (the mockup's `RouteCover` grid); the map-first
  view from ADR-021/CR-118 becomes a second tab rather than being deleted.
- The organizer cabinet regains a sidebar; CR-108's header-registry navigation
  (ADR-009) stays as the _data source_ (`ORGANIZER_NAV`), only its renderer changes.

### Decision

1. **Three colour roles instead of one overprint ink.** ADR-021 used a single
   `primary`/`route` hex for text, focus, the primary button fill and the map route.
   That collapses under the new hue: `#82668C` alone is only 4.4:1 on the light page
   background — insufficient for AA body text. `primary` (links, focus ring, active
   tab — AA text contrast, `#74597E` light / `#B8A0C1` dark) splits from the new
   `brand` (logo, route track, graphic elements only — ≥3:1, `#82668C` light /
   `#B8A0C1` dark) and the new `primary-fill`/`primary-fill-hover`/`on-primary-fill`
   (button fill, `#82668C` in both themes, white text). `route`/`map-route`/
   `map-marker-selected`/`map-route-casing` move to `brand`; the `.dark`-override gap
   on the `map-*` tokens is unchanged (2GIS tiles still stay light in both UI themes,
   KI-057 — this ADR does not revisit that).
2. **`contour` is renamed `elevation`** (name and role unchanged: the elevation
   profile's ink, `chart-secondary`'s alias) — purely a naming clarification, no new
   meaning.
3. **Shape changes from a 4px stamp to pills and large radii**: buttons and filter
   chips are fully rounded (`rounded-full`); cards, panels and the route cover use
   large radii (`rounded-2xl`/`rounded-3xl`); metric cells and inputs use
   `rounded-xl`. `danger`/`danger-filled` semantics from ADR-021 are unchanged.
4. **Dark is the default theme** when nothing is stored (`apps/web/src/lib/theme/
theme.ts`'s empty-`localStorage` fallback becomes `dark` instead of `system`); the
   three-state toggle (Система/Светлая/Тёмная) is unchanged — "Система" still tracks
   `prefers-color-scheme` once chosen explicitly.
5. **Two additive webfonts**: Unbounded (ride titles, screen headings — replaces
   Sofia Sans Condensed in that role only) and Sofia Sans Extra Condensed (the large
   tabular metric numerals in `MetricTile`/the route cover). Golos Text (body), Sofia
   Sans Condensed (labels/eyebrows) and IBM Plex Mono (data/units/timestamps) are
   unchanged.
6. **Route cover replaces the flat placeholder.** A new `RouteCover` component draws
   a dark "window" (unaffected by the UI theme, like a photo) from the ride's own
   route/elevation data: a decorative isoline background, the actual track projected
   with the existing `route-preview.ts` geometry, and an elevation silhouette footer
   from the existing `elevation-profile.ts` pipeline — reusing, not duplicating, the
   two SVG-generation utilities ADR-021's discovery/ride-detail work already built.
7. **Discovery is a card grid again, map moves to its own tab.** A segmented
   "Заезды/Карта" control replaces the map-first single view; "Заезды" is a
   `RouteCover`-card grid, "Карта" is the existing map-first `DiscoveryList` view,
   unchanged, just relocated behind the tab.
8. **The organizer cabinet regains a desktop sidebar.** `ORGANIZER_NAV` (ADR-009's
   registry) is still the only source of nav items — a new feature still registers
   once and appears automatically — but `CabinetShell` renders it as a sidebar for
   `/organizer/*` instead of only a header dropdown. The header dropdown pattern
   stays for `/me/*` and for mobile (bottom tab bar replaces it there).
9. **Token names for everything not called out above are kept** (`.claude/rules/
extensibility.md`: contracts change additively) — `bg`, `bg-raised`, `surface`,
   `text`, `text-secondary`, `text-muted`, `success`, `warning`, `danger`, `info`,
   `border`, `border-input` keep their names, only their hex values move to the new
   palette.

### Rationale

- **Why not keep `primary` as both text and fill colour, as ADR-021 did**: ADR-021's
  single hex worked because `#9033A1` cleared AA at 7.4:1 on white. `#82668C` does
  not; inventing three roles was the only way to keep both AA text and the exact
  locked brand hex the product owner chose off the rendered mockup.
- **Why the map-first view stays instead of being deleted**: CR-118…CR-120 built a
  real map-pin/legend-row sync interaction; the mockup's card grid does not replace
  that need, it answers a different one (browse quickly vs. see where). A tab keeps
  both rather than re-litigating which one is "right".
- **Why the sidebar returns as a `CabinetShell` render change, not a registry
  change**: CR-108 removed the sidebar as a _layout_ choice, not because ADR-009's
  registry pattern was wrong — reverting the render while keeping the registry means
  no feature-module code needs to change to get a sidebar item back.

### What this does NOT mean

- It does not relax "colour never carries meaning alone" (§12) or any AA requirement
  — the new three-role split exists specifically to keep AA, not loosen it.
- It is not a second supersession of ADR-022/ADR-023 (pace groups, rider profiles) —
  those stay exactly as decided, only their on-screen presentation changes.
- The 2GIS basemap itself is not redesigned or made to follow a dark map style —
  KI-057's light-tile constraint on the `map-*` tokens is unchanged.

### Rollback

Purely presentational plus one navigation-render change, no data/API impact: revert
`packages/ui/src/tokens.css`, `apps/web/src/app/layout.tsx` (fonts), `apps/web/src/
lib/theme/theme.ts` (default), `app/icon.svg`, `packages/ui`'s `Button`/
`StatusBadge`/`MetricTile`/`Wordmark`, the new `RouteCover`/`AvatarStack` components,
the discovery tab split, and `CabinetShell`'s sidebar render to their pre-CR-130
versions. Token names are unchanged except the `contour`→`elevation` rename, so most
consumers need no changes on the way back; that rename would need a mechanical
reverse pass across every `*-elevation` Tailwind utility.

### When to revisit

If a dark 2GIS basemap style becomes available (KI-057's blocker), reconsider
`map-*` tokens gaining a real `.dark` override. If the discovery tab split turns out
to fragment usage (most people staying on one tab and never finding the other), the
two views may need to merge into one screen instead of two tabs.
