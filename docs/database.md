# Database Model

Conceptual model. Exact columns and indexes evolve through migrations.

- User — account. First real table (CR-011): `id`, `email` (unique, stored
  lowercased by the service layer), `passwordHash` (Argon2id), `emailVerified`
  (default `false`, flipped by verify-email), `createdAt`/`updatedAt`
  (`timestamptz`). No `passwordHash` ever leaves `apps/api` in a response.
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
- OrganizerProfile — public organizer data linked to User.
- Ride — cycling event owned by OrganizerProfile.
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
