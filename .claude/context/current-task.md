# Current task

## Task ID

CR-086 — Cover image pipeline (ADR-019). Last unchecked ticket in
`docs/tasks.md`; its code was already implemented in an earlier session but
left uncommitted with the docs half unfinished.

## Goal

Validate the already-implemented cover image pipeline end to end (not just
trust that it was written correctly), finish the documentation it left
incomplete (`docs/api.md`, `docs/database.md` still described the old
deferred `coverImageUrl` state), and commit.

## Requirements / acceptance criteria

Per the original CR-086 plan (already implemented): `POST`/`PATCH`/`DELETE`/
`GET /v1/rides/:id/cover`, JPEG/PNG/WebP validated by decoding with `sharp`,
8 MB cap, resize to 1920×1920 max, served via API proxy never a direct S3
URL, `/organizer/rides/[id]/cover` screen, `RideCard`/`RideDetailView`'s
`next/image` branches go live. This session's own bar: typecheck/lint/test/
build all clean, plus a real (not mocked) upload → download → replace →
delete round trip against the actually-running MinIO.

## Planned files

None new — validating and documenting already-written code. Docs:
`docs/api.md` (new "## Cover image" section), `docs/database.md` (Rides
table field list), `.claude/context/known-issues.md` (KI-023 update),
`docs/tasks.md`, `docs/changelog.md`, this file, `project-state.md`.

## Implementation progress

Done — validation + documentation only, no code changes.

- `pnpm --filter api/web typecheck`/`lint`: clean.
- `pnpm --filter db db:migrate` run against both `coffee_ride_dev` (real
  native Postgres) and the Docker Compose `coffee_ride` database — CR-086's
  two migrations (`0014_tense_revanche.sql`, `0015_high_owl.sql`) applied to
  both.
- `pnpm --filter api test`: 345 passed, 1 skipped (27/27 cover-image tests
  among them). `pnpm --filter web test`: 185 passed.
- `pnpm turbo run build`: clean, `/organizer/rides/[id]/cover` compiles.
- Live round trip against the real running MinIO via curl against the
  already-running dev `apps/api`: register → verify → login → create
  organizer profile → create draft ride → `POST .../cover` (400×300 JPEG,
  `201`) → `GET /v1/rides/:id` shows the real `coverImageUrl` → anonymous
  `GET .../cover` on the draft ride correctly `404`s → authenticated `GET
.../cover` returns the actual bytes, decodes as a real 400×300 JPEG →
  `PATCH .../cover` with a 3000×2000 image → downloaded back as exactly
  1920×1280 (resize bound confirmed) → `DELETE .../cover` → `204`,
  `coverImageUrl` back to `null`, subsequent `GET` `404`s.
- Test data (the one ride/organizer profile/user created for the live
  check) deleted from the real `coffee_ride_dev` database afterward —
  confirmed the real user count was unchanged before/after.
- `docs/api.md`: new "## Cover image" section (all four endpoints), and
  `PATCH /v1/rides/:id`'s note about `coverImageUrl` updated (was "deferred
  to the S3 pipeline (KI-023)", now "computed... from the dedicated
  `.../cover` endpoints").
- `docs/database.md`: Rides table entry updated —
  `coverImageUrl`→`coverImageKey` rename + two new columns.
- `.claude/context/known-issues.md`: KI-023 updated — `Ride` resolved,
  `User`/`OrganizerProfile` avatars stay open, noted as reusing CR-086's
  modules.
- `docs/tasks.md`: CR-086 checked off with full detail.
- `docs/changelog.md`: entry appended.
- `project-state.md`: updated (current task, apps/web section, apps/api
  section, Next, Known limitations, Do not break, Last updated).
- Committed and pushed to `main`.

## Validation results

All green — see Implementation progress above for the exact commands/counts.

## Discovered issues

None — the previous session's implementation held up under both automated
tests and a real live round trip with no fixes needed.

## Final result

CR-086 done, committed, pushed. `docs/tasks.md` has no unchecked ticket
left. Next candidates (no ticket number assigned yet): an avatar endpoint
for `User`/`OrganizerProfile` (KI-023's remainder), or a real consumer for
`packages/maps-2gis` (KI-032/KI-031, or CR-028/CR-084's route rendering).
