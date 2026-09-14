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
- Ride — cycling event owned by OrganizerProfile (CR-017 landed the table; CR-018+
  fill most of it in). `id`, `organizerId` (FK → OrganizerProfile, `ON DELETE
RESTRICT` — losing every ride a profile owns as a side effect of some future
  profile-delete feature would be real data loss), `title` (not null, 1-140
  chars), `description` (nullable, ≤5000 chars, CR-018), `coverImageUrl`
  (nullable, deferred to the S3 pipeline like KI-023), `bicycleType` (not null,
  pg enum `road`/`gravel`/`mtb`/`any`), `startsAt` (`timestamptz`, not null) +
  `startTimezone` (IANA identifier, not null, ADR-012 §2), `participantLimit`
  (nullable int, CHECK `>= 1`), `priceRub` (nullable int, CHECK `>= 0`),
  `distanceKm` (nullable numeric(6,1), CHECK `>= 0`), `elevationGainMeters`
  (nullable int, CHECK `>= 0`), `paceKmh` (nullable numeric(4,1), CHECK `>= 0`),
  `durationMinutes` (nullable int, CHECK `>= 0`), `difficulty` (nullable int,
  CHECK `1-5`), `status` (not null, pg enum matching the Lifecycle section
  above, default `draft`), `createdAt`/`updatedAt` (`timestamptz`),
  `updatedBy` (nullable FK → User, `ON DELETE SET NULL` — audit trail,
  `.claude/rules/security.md`). CR-017 ("Create ride") only ever sets
  `organizerId`/`title`/`bicycleType`/`startsAt`/`startTimezone`/`status`
  (`draft`) — every other column stays `null` until CR-018 ("Edit draft") fills
  it in; see `.claude/context/current-task.md` for the create/edit split
  rationale. `RideRequirement`/`RideService` (below) and `Route`/`RoutePoint`/
  `Stop` are separate tables, not columns here.
- Route — route geometry and metadata.
- RoutePoint — start/finish/stop/danger/water/food/technical/other.
- Stop — named planned stop with location and duration.
- RideRequirement — participation rules.
- RideService — included logistics/services.
- Registration — User ↔ Ride.
- WaitlistEntry — user waiting for a place.
- RideUpdate — organizer message.
- Notification — delivery record.
- Review — participant feedback.

Important invariants:

- ride has organizer;
- active duplicate registration is forbidden;
- capacity is server-side and atomic;
- private participant data is restricted.

## Time

See `docs/decisions.md` → ADR-012.

- every timestamp column is `timestamptz`, never bare `timestamp`;
- `Ride` additionally stores the IANA timezone of its start location
  (`Europe/Moscow`, `Asia/Krasnoyarsk`, …) — the instant answers "has it started",
  the zone answers "what does the organizer's 08:00 mean". Store the identifier,
  never a fixed offset.

Use migrations for every schema change.
