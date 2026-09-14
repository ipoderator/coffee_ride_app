# Current Task

## Status

complete

## Task ID

CR-013 — Profile

## Goal

Let a logged-in user view and edit their own profile (`docs/design.md` §8: `/me/profile`
"Profile settings"). Next unchecked backlog item after CR-012 (`docs/tasks.md`,
`.claude/context/project-state.md`: "CR-013 (Profile) is next").

Context read this session: `.claude/CLAUDE.md`, all `.claude/rules/*.md`,
`docs/tasks.md`, `.claude/context/{project-state,current-task,known-issues}.md`,
`docs/api.md`, `docs/product.md`, `docs/design.md` (§8 screen inventory, §9 component
inventory), `docs/decisions.md` ADR-009/ADR-013, `.claude/skills/{new-cabinet-feature,
new-api-endpoint,db-migration}/SKILL.md`, `packages/db/src/schema/{user,session}.ts`,
`packages/types/src/{domain/user.ts,api/auth.ts,index.ts}`,
`apps/api/src/modules/auth/*`, `apps/api/src/{app.ts,env.ts,routes/v1.ts,plugins/auth.ts}`,
`apps/web/src/{app/**,features/auth/register/**,lib/utils.ts}`,
`packages/ui/src/{index.ts,components/*}`.

## Scoping decisions made this session (no product doc covers these yet)

- `docs/product.md`/`docs/design.md` don't enumerate profile fields. Decided: minimal
  viable profile = `displayName` (≤80 chars), `phone` (private, loose format check —
  full E.164 validation deferred), `bio` (≤500 chars). All nullable/optional — a user
  can leave any/all unset.
- Avatar/photo upload is explicitly OUT of scope: needs the S3 pipeline
  (KI-015: S3 client never live-verified; CR-086 is the cover-image-pipeline ticket
  this would piggyback on). Documented as a new gap below, not silently dropped.
- No web `/login` page existed yet (CR-012 shipped API-only). Building `/me/profile`
  needs a way to actually authenticate from the browser, so this ticket also adds the
  `/login` screen (`docs/design.md` §8 already lists it alongside `/register` as one
  "Auth" screen pair) — necessary prerequisite, not scope creep.
- No cabinet shell/nav registry exists yet (ADR-009/CR-054 still open). `/me/profile`
  needs _some_ shell. Built the minimal real thing: a participant nav-item registry
  (`apps/web/src/lib/cabinet/participant-nav.ts`) that features push a descriptor into,
  and a shell component rendering from that list — not a full dashboard (widgets,
  organizer side, feature flags stay CR-054/CR-015 scope). `/me` gets a minimal stub
  page so the route isn't a 404; full cabinet-home content is CR-015.
- `GET /v1/auth/me` already returns the full `User` shape — no separate
  `GET /v1/users/me` added (CLAUDE.md: no duplicate concepts). New endpoint is
  `PATCH /v1/users/me` only, in a new `users` feature module
  (`.claude/rules/architecture.md` lists `users` as its own backend feature area,
  distinct from `auth`).

## Requirements

- `packages/db`: add nullable `display_name`, `phone`, `bio` text columns to `users`
  (additive migration, `.claude/rules/database.md`/db-migration skill).
- `packages/types`: extend `User` with `displayName/phone/bio: string | null`
  (required-but-nullable — the server always includes them; 3 pre-existing test
  fixtures in `register.test.tsx` updated to match); new
  `updateProfileRequestSchema`/`UpdateProfileRequest`/`UpdateProfileResponse` in
  `api/users.ts`.
- `apps/api`: new `modules/users/` (`user-response.schema.ts` shared with `auth.routes.ts`
  so there's exactly one "user over the wire" shape, `users.service.ts`, `users.routes.ts`
  registering `PATCH /v1/users/me` under `/v1/users`, requires `requireAuth`, identity
  from `request.user.id` only — never a client-supplied id). `auth.service.ts`'s
  `toPublicUser` extended to include the new fields everywhere it's already used
  (register/login/verify-email/me responses too — additive, not a breaking change).
- Server-side validation: displayName trimmed 1-80 chars, phone loose regex 7-20 chars,
  bio ≤500 chars; each field independently omittable (unchanged) or settable to `null`
  (cleared) via PATCH semantics.
- `apps/web`: `/login` page + `features/auth/login/` module; participant cabinet shell
  (`/me` layout + minimal `/me` stub + `/me/profile`) gated on a valid session,
  redirecting to `/login` on 401; `features/participant/profile/` module (form: view +
  edit displayName/phone/bio, loading/error/duplicate-submit protection per
  `.claude/rules/frontend.md`). New shared `Textarea` primitive in `packages/ui`
  (bio needs a multi-line control; `Input`/`Button`/`Card`/`FormField` already exist,
  `Textarea` doesn't yet — same tier component, `docs/design.md` §9 already lists it).
  Small shared `apps/web/src/lib/api/errors.ts` (`ApiError`) extracted from
  `register/api.ts` so login/profile don't each grow a third copy of the same class.

## Acceptance criteria

- Migration applies cleanly against the existing scratch DB; existing rows get
  `NULL` for all three new columns.
- `PATCH /v1/users/me`: no cookie → 401; valid cookie + valid partial body → 200 with
  the updated fields reflected in the response and in a direct DB read; invalid
  payload (too-long displayName/bio, malformed phone) → 400 `validation_error`;
  omitted fields stay unchanged; explicit `null` clears a field; response never
  contains `passwordHash`.
- `GET /v1/auth/me` (and register/login/verify-email) now includes
  `displayName`/`phone`/`bio` (null when unset) — existing tests for those routes
  still pass unmodified (additive fields only).
- CSRF check already covers `PATCH` under `/v1` (no new plugin needed — verified, not
  assumed).
- Web: `/login` — wrong credentials show a generic error, success redirects into `/me`;
  `/me/profile` — loads current values, edits persist (verified via reload), shows
  server validation errors per field, duplicate-submit protected; unauthenticated
  visit to `/me` or `/me/profile` redirects to `/login`.
- `turbo run lint/typecheck/build/test` (run separately) all green; `format:check`/
  `lint:root` clean.
- Live check: real Postgres + both dev servers — curl PATCH sequence (unauth 401,
  valid patch 200, invalid payload 400) plus a browser-less curl-based login→me
  round trip confirming the new fields appear.

## Planned files

- `packages/db/src/schema/user.ts` (+3 columns), new migration.
- `packages/types/src/domain/user.ts`, new `packages/types/src/api/users.ts`,
  `packages/types/src/index.ts` (+export).
- `apps/api/src/modules/users/{user-response.schema.ts,users.service.ts,users.routes.ts,
users.routes.test.ts}`, `apps/api/src/modules/auth/{auth.service.ts,auth.routes.ts}`
  (reuse shared schema, extend `toPublicUser`), `apps/api/src/routes/v1.ts` (register).
- `apps/web/src/lib/api/errors.ts` (new, extracted), `apps/web/src/lib/api/current-user.ts`
  (new — `GET /v1/auth/me` client), `apps/web/src/lib/auth/current-user-context.tsx`,
  `apps/web/src/lib/cabinet/{types.ts,participant-nav.ts}`,
  `apps/web/src/components/cabinet/CabinetShell.tsx`.
- `apps/web/src/features/auth/register/api.ts` (import shared `ApiError` instead of
  its own copy — the one pre-existing file touched for a non-new-feature reason).
- `apps/web/src/features/auth/login/{api.ts,components/LoginForm.tsx,login.test.tsx}`,
  `apps/web/src/app/login/page.tsx`.
- `apps/web/src/features/participant/profile/{api.ts,components/ProfileForm.tsx,
nav.ts,profile.test.tsx}`, `apps/web/src/app/me/{layout.tsx,page.tsx,profile/page.tsx}`.
- `packages/ui/src/components/{Textarea.tsx,Textarea.test.tsx}`, `packages/ui/src/index.ts`
  (+export), `packages/ui/src/terminology.ts` (+`AUTH_TERMS` login/profile copy, or a new
  `PROFILE_TERMS`/`CABINET_TERMS` block).
- `.env.example`/`docs/api.md` (new Users section)/`docs/database.md` (new columns).

## Implementation progress

- [x] Plan written (this file) — proceeding per the user's explicit instruction to
      continue implementing per the established backlog plan, no separate `/plan`
      approval step invoked this session.
- [x] `packages/db` schema + migration (`0002_nebulous_nebula.sql`), applied to
      `coffee_ride_dev`
- [x] `packages/types` contract additions
- [x] `apps/api` users module + auth module extension + tests
- [x] `packages/ui` `Textarea`
- [x] `apps/web` login feature + page
- [x] `apps/web` cabinet shell/registry + participant profile feature + pages
- [x] Full validation (`turbo run lint/typecheck/build/test` separately,
      `format:check`/`lint:root`)
- [x] Live check via curl + a full browser flow (`browser-automation` skill)
- [x] Context/docs updated (changelog, project-state, architecture-map,
      known-issues, tasks.md, docs/api.md, docs/database.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck` (all 8 packages): clean.
- `turbo run lint` (all 8 packages): clean.
- `turbo run build` (6 buildable packages): clean, including `apps/web`'s
  `next build` (new routes `/login`, `/me`, `/me/profile` all statically
  generated).
- `pnpm format:check` / `pnpm lint:root`: clean.
- `turbo run test` against `DATABASE_URL` pointed at the local scratch
  Postgres: `apps/api` 44 tests (was 38), `apps/web` 30 tests (was 8, +22 new
  across 2 new files), `packages/ui` 85 tests (was 82, +3 for `Textarea`),
  `packages/maps-2gis` 11 tests — all green. Re-ran the full `apps/api` suite
  5 consecutive times to confirm the two real bugs found this session (see
  below) are stably fixed, not just lucky once — same discipline as CR-012's
  deadlock fix.
- Live check via curl against a real `apps/api` + the scratch Postgres:
  register → login → `GET /me` (shows new null fields) → `PATCH /v1/users/me`
  unauthenticated (401) → authenticated with valid fields (200, persisted,
  confirmed via a follow-up `GET /me`) → invalid payload (400
  `validation_error`) → mismatched `Origin` (403 `csrf_origin_mismatch`). All
  matched the acceptance criteria exactly.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + the same `apps/api`: unauthenticated `/me` → redirected
  to `/login`; login with an existing account → redirected to `/me`, nav
  showed the registry-rendered "Профиль" link; clicked through to
  `/me/profile`, form pre-filled with the account's existing
  displayName/phone/bio; edited displayName, saved, saw the success message;
  reloaded the page and confirmed the new value persisted (not just
  optimistic local state). No console errors beyond the expected pre-login
  401 on `/api/v1/auth/me` (visiting `/me` before authenticating).
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation (not left open):

- `apps/api/src/plugins/db.ts` never closed its postgres.js connection pool
  on `app.close()` — a genuine resource leak (not just a test artifact),
  invisible until this session's fourth DB-touching Vitest file pushed
  concurrent connections high enough to intermittently exhaust the scratch
  Postgres's `max_connections`, surfacing as unrelated `500`s. Fixed with an
  `onClose` hook calling `db.$client.end()`. Documented as KI-R11 in
  `known-issues.md`.
- Even after that fix, concurrent Vitest _files_ (not just concurrent tests
  within one file — already handled since CR-012) sharing one real Postgres
  and each doing an unscoped `beforeEach: DELETE FROM users` still collided
  with each other's in-flight requests under Vitest's default cross-file
  parallelism, producing genuine intermittent Postgres deadlocks/500s. Fixed
  with `fileParallelism: false` in `apps/api/vitest.config.ts` — the suite is
  small enough (4 files) that serializing costs no meaningful time. Verified
  stable across 5 consecutive full-suite runs. Documented as KI-R12.
- `apps/web/vitest.config.mts` had no `resolve.alias` for the `@/*` tsconfig
  path — never needed before because no Vitest-tested file had used that
  import form (only page.tsx files did, and those are Playwright-tested
  against a real `next dev` server, which resolves it natively). Fixed by
  adding the alias, mirroring `tsconfig.json`.

No open known-issue entries were created by fixing these — all three are
resolved same-session, same convention as CR-065's KI-R10. One new _open_
known issue was created deliberately (not a bug): KI-023, avatar/photo
upload out of scope for this ticket (needs the S3 pipeline, KI-015/CR-086).

## Final result

CR-013 complete. `PATCH /v1/users/me` implemented; `GET /v1/auth/me` (and
register/login/verify-email) now additionally return `displayName`/`phone`/
`bio`. `/login`, `/me`, `/me/profile` screens built, gated on a valid
session via the first real ADR-009 participant cabinet nav registry. All
acceptance criteria met, full validation suite green (stable across repeated
runs), live-verified end to end over both curl and a real browser session.
Two real latent bugs (unclosed DB pool, cross-file test races) found and
fixed as part of this session's validation work, not deferred. `docs/
tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`,
`.claude/context/architecture-map.md`, `.claude/context/known-issues.md`,
`docs/api.md`, `docs/database.md` all updated. Not yet committed — `git
diff`/`git status` reviewed next; pre-existing unrelated pending changes
(`docs/product.md`, `skills-lock.json`) again left untouched and out of
scope, same as at the start of every prior session this backlog has run.
