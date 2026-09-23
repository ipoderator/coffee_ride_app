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
  `coverImageKey` (nullable text, S3 object key — CR-086/ADR-019, renamed from
  the original never-populated `coverImageUrl` column once cover images are
  served via an API proxy rather than a stored direct URL; the public
  `coverImageUrl` API field is now computed from this key at response time),
  plus `coverImageContentType`/`coverImageSizeBytes` (nullable, set together
  with the key; `coverImageSizeBytes` CHECK `>= 0`),
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
- RideGroup — a pace group inside one ride (CR-117, ADR-022): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `name` (not null, CHECK 1–60 chars, unique per ride
  case-insensitively — `ride_groups_ride_id_name_unique` on `(ride_id, lower(name))`),
  `paceKmh` (not null, numeric(4,1), CHECK 5–60), `description` (nullable, ≤500 —
  Zod-layer limit only), `position` (not null, CHECK `>= 0`, unique per
  `(rideId, position)`, kept dense `0..n-1` by the service — appended on create,
  movable via `PATCH`, renumbered on delete), `createdAt`/`updatedAt`/`updatedBy`.
  A unique constraint on `(id, rideId)` is the target of the composite FKs from
  `Registration`/`WaitlistEntry`. At most 6 per ride — service-enforced under the
  `rides` row lock (a CHECK on `position` would leave no free slot for the two-phase
  renumbering a reorder needs). Capacity stays ride-level; no per-group limit.
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
  `GET /v1/rides/:id`. CR-117 added `groupId` (nullable uuid): composite FK
  `registrations_group_ride_fk` `(group_id, ride_id) → ride_groups(id, ride_id)`
  (`ON DELETE NO ACTION`, `MATCH SIMPLE` — `null` skips the check) guarantees the
  group belongs to the same ride; indexed (`registrations_group_id_idx`) for the
  per-group counts and the delete-group reference check. Required by the service once
  the ride has groups; `null` for rides without groups or registrations made before
  groups existed.
- WaitlistEntry — user waiting for a place (CR-036, "Waitlist"): `id`, `rideId` (FK →
  Ride, `ON DELETE CASCADE`), `userId` (FK → User, `ON DELETE CASCADE`), `status` (not
  null, pg enum `waiting`/`promoted`/`cancelled`, default `waiting`), `createdAt`/
  `updatedAt` (`timestamptz`), `cancelledAt` (nullable, set only when `status` becomes
  `cancelled` — enforced by a CHECK), `promotedAt` (nullable, set only when `status`
  becomes `promoted` — enforced by a CHECK), `groupId` (CR-117, nullable — same
  composite FK as `Registration.groupId`, `waitlist_entries_group_ride_fk`; copied into
  the registration a promotion creates). Queue order is `createdAt` ascending, no
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

## Backups

See `docs/decisions.md` → ADR-018 "What this does NOT mean": where production
Postgres actually runs is an undecided, operator-specific choice —
`docker-compose.prod.yml` assumes `DATABASE_URL` already points at a real,
externally provisioned instance rather than starting one itself. Backups
follow the same shape as `packages/db/src/migrate.ts`: a plain script driven
entirely by `DATABASE_URL`, with no assumption about hosting.

`packages/db/scripts/backup.sh` (`pnpm --filter db db:backup`) runs
`pg_dump --format=custom` against `DATABASE_URL` into a timestamped file (default
`./backups/coffee_ride_<UTC timestamp>.dump`, overridable via `BACKUP_DIR`), then
prunes files older than `BACKUP_RETENTION_DAYS` (default 7, disable with `0`).
The custom format is required for `pg_restore` (below) — it is not a plain SQL
dump.

`packages/db/scripts/restore.sh` (`pnpm --filter db db:restore -- <file>`) runs
`pg_restore --clean --if-exists` against a target `DATABASE_URL`, restoring a
`backup.sh`-produced file. `--clean --if-exists` means it works both restoring
into an empty freshly created database (disaster recovery) and on top of a
database that already has the schema (e.g. verifying a backup by restoring it
into a scratch database) — either way it drops and recreates every object
first rather than erroring on "already exists".

Backup _destination_ (this local directory vs. syncing it to S3/offsite
storage) is deliberately left to whoever operates the real Postgres instance,
for the same reason its host is undecided — wiring a specific offsite target
here would invent a hosting decision this repo hasn't made.

Scheduling itself is no longer left to a cron entry someone has to remember to
add (CR-096: the original version of this section only documented a cron
one-liner, and no session ever actually installed it anywhere — `backup.sh`
sat unused until it accidentally became the _only_ thing standing between a
real data-loss incident and a restore, see KI-049). `docker-compose.prod.yml`'s
`backup` service now runs `backup.sh` automatically — no `migrate`-style
profile flag needed, since a backup is read-only against the database and
therefore safe to always run. It takes an immediate backup on `docker compose
up`, then repeats every `BACKUP_INTERVAL_SECONDS` (default 86400 = daily),
writing into the `postgres_backups` named volume; `BACKUP_RETENTION_DAYS`
(default 14 in that service, vs. this script's own 7-day default) controls
pruning the same way it does when the script is run by hand. A failed run
logs to the container's stdout and retries next interval rather than
crash-looping. Copying files out of the `postgres_backups` volume to actual
offsite storage is still the operator's own responsibility — this only
guarantees a recent restorable dump always exists on the host.

For local development, there is no equivalent automatic schedule — a local
dev database is normally disposable (that's the whole point of KI-049's fix:
`apps/api`'s test suite now runs only against a disposable database, never a
real one). If a local database does accumulate real data you'd mind losing
(manual QA, a demo), run `pnpm --filter db db:backup` by hand before anything
destructive, or point `BACKUP_DIR` at wherever you want the dump kept.

A restore was live-verified against this environment's real local Postgres
(2026-09-19, CR-078): a backup of the working `coffee_ride_dev` database was
restored into a separate scratch database and its row counts across every
real table matched the source exactly, then the scratch database was
dropped. See `docs/changelog.md`'s CR-078 entry for the exact procedure and
counts — do not treat "the script exits 0" alone as a verified restore in any
future check of this mechanism.
