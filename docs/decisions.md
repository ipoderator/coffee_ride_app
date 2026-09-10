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
Status: Accepted (architecture and requirements); concrete session provider/adapter
still Pending.

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
  distributed transaction/saga, which is a *harder* reliability problem, not an easier one.
- At MVP scale, the operational surface of real microservices (service discovery,
  inter-service auth, distributed tracing, N independent deployments, contract
  versioning) is itself a common source of outages, not a way to avoid them.
- The stated goal — "a bug in one area shouldn't take down everything" — is a resilience
  problem, not a deployment-topology problem. It is addressed directly by
  `.claude/rules/resilience.md`.

What this does NOT mean:
- Internal code must still be organized into strict domain modules with clear boundaries
  (auth, users, organizers, rides, routes, registrations, notifications, reviews — see
  `rules/backend.md` / `rules/architecture.md`), designed so any of them *could* be
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
