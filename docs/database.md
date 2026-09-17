# Database Model

Conceptual model. Exact columns and indexes evolve through migrations.

- User — account. First real table (CR-011): `id`, `email` (unique, stored
  lowercased by the service layer), `passwordHash` (Argon2id), `emailVerified`
  (default `false`, flipped by verify-email), `displayName`/`phone`/`bio`
  (CR-013, all nullable — profile fields set via `PATCH /v1/users/me`; `phone`
  is private contact data, returned only to the profile's own owner),
  `createdAt`/`updatedAt` (`timestamptz`). No `passwordHash` ever leaves
  `apps/api` in a response.
- EmailVerificationToken — one row per issued verification token for a User
  (CR-011): `id`, `userId` (FK → User, cascade delete), `tokenHash` (SHA-256 of
  the raw token — the raw value is never persisted, same pattern as ADR-013's
  `Session.tokenHash`), `expiresAt` (24h, `timestamptz`), `usedAt` (nullable —
  null means unused, single-use once set), `createdAt`. Not one of the fixed
  domain entities in `.claude/CLAUDE.md` — an auth implementation detail, not
  a product concept.
- PasswordResetToken — one row per issued password-reset request for a User
  (CR-060), same shape as EmailVerificationToken: `id`, `userId` (FK → User,
  cascade delete), `tokenHash` (SHA-256 of the raw token — never persisted
  raw), `expiresAt` (30 min, `timestamptz`), `usedAt` (nullable — single-use;
  a successful reset also marks every other still-outstanding token for that
  user as used), `createdAt`. Unlike EmailVerificationToken's dev-only
  response field, the raw token here is never returned over HTTP in any
  environment (`.claude/rules/security.md`'s no-account-enumeration
  requirement on `POST /v1/auth/forgot-password`). Not a fixed domain
  entity — an auth implementation detail.
- Session — one row per active login (CR-012, ADR-013): `id`, `userId` (FK →
  User, cascade delete), `tokenHash` (SHA-256 of the opaque cookie token —
  same never-store-the-raw-value pattern as `EmailVerificationToken`),
  `createdAt`, `expiresAt` (30-day lifetime, rolling — extended at most once
  per day on use, not on every request), `lastUsedAt`, `revokedAt` (nullable;
  part of ADR-013's fixed column list, unused by any CR-012 code path — no
  admin "block" feature exists yet). Logout hard-deletes the row rather than
  setting `revokedAt`. Also not one of the fixed domain entities — an auth
  implementation detail.
- OrganizerProfile — public organizer data linked to User (CR-014): `id`,
  `userId` (FK → User, cascade delete, unique — at most one per User, ADR-006),
  `name` (not null, 1-100 chars, the organizer's public identity — separate
  from `User.displayName` since an individual/club/shop/team all share this
  one path), `description` (nullable, ≤500 chars), `createdAt`/`updatedAt`
  (`timestamptz`). Creation is gated on `User.emailVerified`
  (`.claude/rules/security.md`).
- Ride — cycling event owned by OrganizerProfile (CR-017 landed the table; CR-018
  fills the rest in via `PATCH /v1/rides/:id`, draft-only). `id`, `organizerId`
  (FK → OrganizerProfile, `ON DELETE RESTRICT` — losing every ride a profile
  owns as a side effect of some future profile-delete feature would be real
  data loss), `title` (not null, 1-140 chars), `description` (nullable, ≤2000
  chars — Zod-layer limit only, no DB CHECK; CR-018 set the actual value, the
  `≤5000` CR-017 had provisionally noted here was never enforced anywhere),
  `coverImageUrl` (nullable, deferred to the S3 pipeline like KI-023),
  `bicycleType` (not null, pg enum `road`/`gravel`/`mtb`/`any`), `startsAt`
  (`timestamptz`, not null) + `startTimezone` (IANA identifier, not null,
  ADR-012 §2), `participantLimit` (nullable int, CHECK `>= 1`), `priceRub`
  (nullable int, CHECK `>= 0`), `distanceKm` (nullable numeric(6,1), CHECK
  `>= 0`), `elevationGainMeters` (nullable int, CHECK `>= 0`), `paceKmh`
  (nullable numeric(4,1), CHECK `>= 0`), `durationMinutes` (nullable int,
  CHECK `>= 0`), `difficulty` (nullable int, CHECK `1-5`), `status` (not null,
  pg enum matching the Lifecycle section above, default `draft`),
  `createdAt`/`updatedAt` (`timestamptz`), `updatedBy` (nullable FK → User,
  `ON DELETE SET NULL` — audit trail, `.claude/rules/security.md`). CR-018
  ("Edit draft") needed no migration — every column already existed from
  CR-017; it only added the `PATCH` endpoint (draft-only, ownership-checked
  per CR-016) and the web form. `RideRequirement`/`RideService` (below) and
  `Route`/`RoutePoint`/`Stop` are separate tables, not columns here.
- Route — route geometry and metadata (CR-027, "GPX upload"): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`, unique — one per ride), `gpxFileKey`/`gpxFileName`/
  `gpxFileSizeBytes` (the uploaded file, stored in S3-compatible object storage —
  `apps/api/src/s3.ts`'s first real consumer, KI-015), `distanceKm`/
  `elevationGainMeters`/`pointCount` (computed from the GPX's own track points —
  haversine sum / positive-elevation-delta sum — independent from `Ride`'s own
  organizer-entered `distanceKm`/`elevationGainMeters`, not reconciled), `geometry`
  (`jsonb`, the ordered `{ lat, lng, elevationMeters }[]` polyline — a single column,
  not a row-per-point table; see the next line), `createdAt`/`updatedAt`,
  `updatedBy` (audit trail).
- RoutePoint — start/finish/stop/danger/water/food/technical/other: a small set of
  organizer-placed _typed_ markers along the route (CR-031): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `type` (not null, pg enum — the eight values above),
  `label` (nullable — a marker's own short name, since two markers can share a
  `type`, e.g. two `water` points), `description` (nullable), `lat`/`lng` (not null,
  numeric(9,6), range-checked — same reasoning as `Stop`: a marker's whole reason for
  existing is a location), `createdAt`/`updatedAt`/`updatedBy` (audit trail). No
  `position` — unlike `Stop`, a route point is a typed map pin, not an ordered
  itinerary entry, so display order is `createdAt` and more than one marker of the
  same `type` is allowed. No separate read endpoint — exposed as an additive
  `routePoints` array on `GET /v1/rides/:id`. Distinct from `Route.geometry` above,
  which is the raw GPX-derived polyline (potentially thousands of points, always
  read/written as one unit, never one row per point).
- Stop — named planned stop with location and duration (CR-030): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `name` (not null), `description` (nullable),
  `lat`/`lng` (not null, numeric(9,6), range-checked — required, unlike `Ride`'s own
  nullable `startLat`/`startLng`, since a stop's entire reason for existing is a
  location), `durationMinutes` (nullable int, CHECK `>= 0`), `position` (not null int,
  server-assigned on create — appended at the end, no reorder support yet — unique per
  `(rideId, position)`), `createdAt`/`updatedAt`/`updatedBy` (audit trail). No
  separate read endpoint — exposed as an additive `stops` array on `GET
/v1/rides/:id`.
- RideRequirement — participation rules.
- RideService — included logistics/services.
- Registration — User ↔ Ride (CR-032, "Register"): `id`, `rideId` (FK → Ride,
  `ON DELETE CASCADE`), `userId` (FK → User, `ON DELETE CASCADE`), `status` (not
  null, pg enum `active`/`cancelled`, default `active`), `createdAt`/`updatedAt`
  (`timestamptz`), `cancelledAt` (nullable `timestamptz`, set only when `status`
  becomes `cancelled` — enforced by a CHECK). A cancelled registration stays a row
  (audit trail, `.claude/rules/security.md`) rather than being deleted, so a
  participant can re-register later — a fresh row, not a resurrected one. A partial
  unique index on `(rideId, userId) WHERE status = 'active'` enforces "active
  duplicate registration is forbidden" at the DB level; capacity (`participantLimit`)
  is enforced by locking the `rides` row (`SELECT ... FOR UPDATE`) inside the same
  transaction as the insert, not a separate constraint — see
  `apps/api/src/modules/registrations/registrations.service.ts`. No separate read
  endpoint — exposed as additive `registrationsCount`/`viewerRegistration` fields on
  `GET /v1/rides/:id`.
- WaitlistEntry — user waiting for a place (CR-036, "Waitlist"): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `userId` (FK → User, `ON DELETE CASCADE`), `status` (not
  null, pg enum `waiting`/`promoted`/`cancelled`, default `waiting`), `createdAt`/
  `updatedAt` (`timestamptz`), `cancelledAt` (nullable, set only when `status` becomes
  `cancelled` — enforced by a CHECK), `promotedAt` (nullable, set only when `status`
  becomes `promoted` — enforced by a CHECK). Queue order is `createdAt` ascending, no
  separate `position` column — a waitlist has no reordering use case, unlike
  `Stop.position`. A partial unique index on `(rideId, userId) WHERE status =
'waiting'` mirrors `Registration`'s duplicate-protection pattern: only one waiting
  row per (ride, user) at a time, any number of promoted/cancelled ones. Joining
  requires the ride to actually be full (re-derived server-side, not trusted from a
  stale client-side `409 ride_full`) — see
  `apps/api/src/modules/registrations/registrations.service.ts`'s `joinWaitlist`.
  Cancelling an active `Registration` promotes the oldest `waiting` entry (if any) into
  a fresh active `Registration`, inside the same transaction/row lock as the
  cancellation itself (`cancelRegistration`) — this is what makes "waitlist
  consistency" atomic, per `.claude/rules/resilience.md`. No separate read endpoint —
  exposed as an additive `viewerWaitlistEntry` field on `GET /v1/rides/:id`.
- RideUpdate — organizer message.
- Notification — delivery record.
- Review — participant feedback on a finished ride (CR-042): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `userId` (FK → User, `ON DELETE CASCADE`; no FK to
  `Registration` — eligibility (active registration on a `finished` ride) is a
  service-layer check, not a DB constraint, so a later registration cancellation
  never retroactively invalidates an already-submitted review), `rating` (not null
  int, CHECK `1-5`), `comment` (nullable, ≤2000 chars — Zod-layer limit only, same
  tier as `RideUpdate.message`), `createdAt` (`timestamptz`). No `updatedAt`/edit —
  immutable, only create + list, same precedent as `RideUpdate`. A plain (non-partial)
  unique index on `(rideId, userId)` enforces one review per participant per ride —
  reviews have no `status`/cancel concept, unlike `Registration`/`WaitlistEntry`. No
  separate `Review` read endpoint beyond `GET /v1/rides/:id/reviews` (public,
  paginated) — the organizer-wide aggregate (CR-043, "Organizer rating summary":
  `avg(rating)`/`count(*)` across every review on any of an organizer's rides,
  computed via a join, not a denormalized column) is exposed as additive
  `rating`/`reviewCount` fields on `RideOrganizerSummary` (`GET /v1/rides`,
  `GET /v1/rides/:id`) and on `GET`/`POST`/`PATCH /v1/organizers/me`.

Important invariants:

- ride has organizer;
- active duplicate registration is forbidden;
- capacity is server-side and atomic;
- waitlist promotion on cancellation is atomic with the cancellation itself (CR-036);
- private participant data is restricted.

## Time

See `docs/decisions.md` → ADR-012.

- every timestamp column is `timestamptz`, never bare `timestamp`;
- `Ride` additionally stores the IANA timezone of its start location
  (`Europe/Moscow`, `Asia/Krasnoyarsk`, …) — the instant answers "has it started",
  the zone answers "what does the organizer's 08:00 mean". Store the identifier,
  never a fixed offset.

Use migrations for every schema change.
