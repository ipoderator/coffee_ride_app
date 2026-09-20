# Current task

Task ID: CR-097 (KI-023 remainder — avatar upload for `User`/`OrganizerProfile`).

Status: **Done.**

## Goal

Resolve the KI-023 remainder: real avatar upload/replace/delete/download
endpoints for `User` and `OrganizerProfile`, reusing CR-086/ADR-019's generic
image-processing (resize/validate) and S3 wrapper modules rather than
rebuilding a third one.

## Requirements / acceptance criteria — all met

- DB: `avatar_key`/`avatar_content_type`/`avatar_size_bytes` on `users` and
  `organizer_profiles`, non-negative CHECK constraint, real migration
  (`0016_avatar_columns.sql`).
- Relocated `modules/rides/cover-image.ts`/`cover-image-storage.ts` to
  `apps/api/src/lib/image-processing.ts`/`image-storage.ts` (generic names)
  so `users`/`organizers` don't reach into `rides`' internals
  (`.claude/rules/resilience.md`). `rides.service.ts` updated; its own tests
  re-verified passing unchanged.
- `POST/PATCH/DELETE/GET /v1/users/me/avatar` — fully "me"-scoped.
- `POST/PATCH/DELETE /v1/organizers/me/avatar` + public `GET
/v1/organizers/:id/avatar`.
- `User.avatarUrl`, `OrganizerProfile.avatarUrl`, `RideOrganizerSummary.
avatarUrl` — all additive.
- `packages/ui` `Avatar` component (new) + `AVATAR_TERMS`; upload UI wired
  into `/me/profile` and `/organizer/profile`.
- No cross-module import of a `rides`-owned file from `users`/`organizers`.

## Implementation summary

- `packages/db/src/schema/{user,organizer-profile}.ts` — new columns + CHECK.
- `packages/db/migrations/0016_avatar_columns.sql`.
- `apps/api/src/lib/{image-processing,image-storage,read-upload}.ts` (new/
  relocated).
- `apps/api/src/modules/rides/rides.service.ts` — import switched to `lib/`.
- `apps/api/src/modules/users/{users.service,users.routes,
user-response.schema}.ts` — avatar functions/routes/schema.
- `apps/api/src/modules/organizers/{organizers.service,organizers.routes,
organizer-profile-response.schema}.ts` — avatar functions/routes/schema +
  exported `organizerAvatarUrlPath`.
- `apps/api/src/modules/rides/{rides.service,ride-response.schema}.ts`,
  `apps/api/src/modules/registrations/registrations.service.ts` — additive
  `avatarUrl` on the organizer summary (imports `organizerAvatarUrlPath`).
- `apps/api/src/modules/auth/auth.service.ts` — `toPublicUser` computes
  `avatarUrl`.
- `packages/types/src/{domain/user,domain/organizer-profile,api/rides,
api/media}.ts` — new/updated types.
- `packages/ui/src/components/Avatar.tsx` (+ test), `terminology.ts`
  (`AVATAR_TERMS`).
- `apps/web/src/features/{participant,organizer}/profile/{api.ts,
components/AvatarUploadForm.tsx}` (+ tests), wired into both profile
  pages/forms.
- New tests: `apps/api/src/modules/{users,organizers}/avatar.routes.test.ts`,
  `packages/ui/src/components/Avatar.test.tsx`,
  `apps/web/src/features/{participant,organizer}/profile/
avatar-upload-form.test.tsx`. Fixed several pre-existing fixtures needing
  `avatarUrl`.

## Validation results

- `pnpm turbo build` — clean, all 9 packages.
- `pnpm turbo lint typecheck` — clean, all 17 tasks.
- `pnpm --filter api test` (real `TEST_DATABASE_URL` Postgres, migrated
  first): 369 passed, 1 skipped.
- `pnpm --filter ui test`: 94 passed.
- `pnpm --filter web test`: 198 passed.
- Live end-to-end verification against the real running Docker stack
  (Postgres/Redis/MinIO all healthy this session): register → verify →
  login → upload user avatar (3000×2000 → confirmed resized to 1920×1280 on
  download) → confirmed real object in MinIO via `mc find` → delete →
  confirmed 404 + object gone from MinIO. Same for organizer avatar, plus
  confirmed the public `GET /v1/organizers/:id/avatar` works with zero
  cookies, and `GET /v1/rides/:id`'s embedded `organizer.avatarUrl` reflects
  it. All live test data cleaned up (DB rows deleted, orphaned S3 object
  removed) afterward.

## Discovered issues (logged, not fixed — out of scope)

- KI-050 (new): `turbo.json`'s `test` task doesn't pass through
  `TEST_DATABASE_URL`, so a plain `pnpm turbo test` fails 15/25 `apps/api`
  files. `pnpm --filter api test` (this session's actual invocation, matches
  CI) is unaffected.
- KI-019 resolved as a side effect (Docker confirmed reachable this
  session — was stale since at least CR-086).

## Final result

All acceptance criteria met, all checks green, live-verified. Persistent
context updated: `docs/changelog.md` (CR-097 entry), `docs/tasks.md`
(checked off), `docs/api.md` (new endpoint docs), `.claude/context/
known-issues.md` (KI-023 resolved, KI-019 resolved, KI-015 updated, KI-050
opened), `.claude/context/project-state.md` (overwritten), `.claude/context/
architecture-map.md` (structural-change entry appended). No new ADR — this
implements ADR-019 point 7's already-decided scope.
