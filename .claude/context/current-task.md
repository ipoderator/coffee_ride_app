# Current Task

## Status

complete

## Task ID

CR-014 — Organizer profile

## Goal

Let a logged-in user create and edit their own `OrganizerProfile` (`docs/product.md`:
"create organizer profile" is MVP capability #2; `docs/design.md` §8: `/organizer/profile`
"Organizer profile"). Next unchecked backlog item after CR-013
(`docs/tasks.md`/`.claude/context/project-state.md`: "CR-014 (Organizer profile) is next").
Continuing per the user's explicit instruction to study prior context and continue
implementing per the established backlog plan — same convention as every prior session
this backlog has run (no separate `/plan` approval step invoked).

Context read this session: `.claude/CLAUDE.md`, all `.claude/rules/*.md`, `docs/tasks.md`,
`.claude/context/{project-state,architecture-map,current-task,known-issues}.md`,
`docs/{api,product,design,decisions,database}.md`, `.claude/skills/{new-cabinet-feature,
new-api-endpoint,db-migration}/SKILL.md`, `packages/db/src/schema/{user,index}.ts`,
`packages/types/src/{index,domain/user,api/users}.ts`, `apps/api/src/modules/{auth/*,
users/*}`, `apps/api/src/{plugins/auth.ts,routes/v1.ts}`, `apps/web/src/{components/
cabinet/CabinetShell.tsx,lib/cabinet/*,lib/auth/current-user-context.tsx,lib/api/*,
app/me/**,features/participant/profile/**}`, `packages/ui/src/{index.ts,terminology.ts,
components/EmptyState.tsx,components/ErrorState.tsx}`.

## Scoping decisions made this session (no product doc enumerates exact fields yet)

- `docs/database.md` only says "OrganizerProfile — public organizer data linked to User."
  Decided minimal viable fields, same discipline as CR-013's User profile scope: `name`
  (required, 1-100 chars — the organizer's public-facing identity; `docs/product.md`
  confirms private individuals/clubs/shops/teams all share this one path, so this is
  _not_ the same as the user's personal `displayName`) and `description` (optional,
  ≤500 chars — "about the organizer", shown later on ride detail per §8's ride-detail
  notes column). Logo/avatar explicitly OUT of scope, same reasoning as CR-013's
  avatar deferral (KI-023: needs the S3 pipeline/CR-086) — this is a second instance of
  that same gap, not a new one.
- One `OrganizerProfile` per `User` (ADR-006: "An `OrganizerProfile` attached to a
  `User` grants organizer capabilities" — singular). Enforced with a unique index on
  `organizer_profiles.user_id`, not just application logic
  (`.claude/rules/database.md`).
- Email verification gate: `packages/db/src/schema/user.ts`'s own comment already
  commits to this ("enforced by future tickets ... starting with organizer-profile
  creation, CR-014") and `.claude/rules/security.md` requires a verified email "before
  an account can act as an organizer." Enforced at creation only (`POST /v1/organizers/
me`) — an already-verified-at-creation-time organizer is not re-checked on every
  subsequent edit (no product requirement to revoke organizer status if email
  verification is somehow later invalidated — nothing in this codebase does that today).
- Three endpoints, mirroring `PATCH /v1/users/me`'s "me"-only pattern but as three verbs
  since creation is a distinct, capability-granting action from an ordinary edit (unlike
  `users.me`, which never needed a POST): `POST /v1/organizers/me` (create, 409 if one
  already exists, 403 if email unverified), `GET /v1/organizers/me` (fetch own, 404 if
  none yet — the web form needs to distinguish "create" vs "edit" mode), `PATCH
/v1/organizers/me` (update own, 404 if none yet). No public `GET /v1/organizers/:id`
  yet — nothing reads organizer data publicly until `Ride` exists (CR-017+), so that
  endpoint is deferred to whichever ride ticket first needs to embed organizer info in a
  ride response, not built speculatively now.
- `CabinetShell` (CR-013) was hard-coded to `PARTICIPANT_NAV_ITEMS` and a `/login`
  redirect. Generalized to take `navItems`/`homeHref`... actually just `navItems` as a
  prop (redirect target stays `/login` — both cabinets require the same participant-tier
  session, organizer capability is a separate, per-action check, not a separate login) —
  `docs/design.md` §8: "Both cabinets share a shell ... that renders from the feature
  registry," confirming this is meant to be the same shell, not a parallel copy
  (`.claude/rules/extensibility.md`: registration over branching applies to the shell
  itself here, not just nav items). New `apps/web/src/lib/cabinet/organizer-nav.ts`
  registry (ADR-009), one entry so far (`/organizer/profile`).
- `/organizer` (bare) gets a minimal stub page, same reasoning as CR-013's `/me` stub:
  the shared layout wraps every `/organizer/*` route, and `docs/design.md` §8 lists
  `/organizer` as "Dashboard (widgets from the ADR-009 registry)" — that's CR-015's
  content, this ticket only avoids a dead 404 for the bare route.
- Discoverability: without CR-015's dashboard, nothing yet links a participant into the
  organizer cabinet. Added one small, additive CTA on the existing `/me` stub (a new
  paragraph + link, `CABINET_TERMS` additions only) pointing at `/organizer/profile` —
  same justification CR-013 used for adding `/login`: a screen `docs/design.md` already
  specifies but that would otherwise be unreachable by anyone not typing the URL by hand.

## Requirements

- `packages/db`: new `organizer_profiles` table — `id`, `userId` (FK → `users`, cascade
  delete, unique index for the one-per-user invariant), `name` (not null), `description`
  (nullable), `createdAt`/`updatedAt` (`timestamptz`, ADR-012).
- `packages/types`: new `domain/organizer-profile.ts` (`OrganizerProfile`), new
  `api/organizers.ts` (`createOrganizerProfileRequestSchema`/
  `updateOrganizerProfileRequestSchema` + response type aliases), `index.ts` exports.
- `apps/api`: new `modules/organizers/` (`organizer-profile-response.schema.ts` — the one
  "organizer profile over the wire" shape; `organizers.service.ts` —
  `OrganizerServiceError`, `createOrganizerProfile`/`getOwnOrganizerProfile`/
  `updateOrganizerProfile`, `toPublicOrganizerProfile`; `organizers.routes.ts` — `POST
/me`, `GET /me`, `PATCH /me` under `/v1/organizers`, all `requireAuth`, identity from
  `request.user.id` only; `organizers.routes.test.ts`). `routes/v1.ts` registers it.
  General rate-limit tier (not an auth endpoint, same reasoning CR-013 used for
  `users.me`).
- Server-side validation: `name` trimmed 1-100 chars (required on create, optional on
  update — omitting it on PATCH leaves it unchanged); `description` trimmed ≤500 chars,
  independently omittable or nullable (clear) on both create and update.
- `apps/web`: generalize `CabinetShell` to accept `navItems`; new `lib/cabinet/
organizer-nav.ts`; new `app/organizer/{layout.tsx,page.tsx,profile/page.tsx}`; new
  `features/organizer/profile/` module (`api.ts`, `nav.ts`,
  `components/OrganizerProfileForm.tsx` — loads existing profile or shows a create form,
  loading/error/duplicate-submit protection per `.claude/rules/frontend.md`,
  `organizer-profile.test.tsx`). New `ORGANIZER_TERMS` in `packages/ui/src/
terminology.ts`. Small additive CTA + new `CABINET_TERMS` entries on the existing `/me`
  stub page.

## Acceptance criteria

- Migration applies cleanly against the existing scratch DB (`coffee_ride_dev`); FK +
  unique-index invariants hold (verified: a second `POST /v1/organizers/me` for the same
  user is rejected, not just discouraged by the API).
- `POST /v1/organizers/me`: no cookie → 401; valid cookie + unverified email → 403
  `email_verification_required`; valid cookie + verified email + valid body → 201 with
  the created profile; a second create for the same user → 409
  `organizer_profile_already_exists`; invalid payload (empty/too-long name, too-long
  description) → 400 `validation_error`.
- `GET /v1/organizers/me`: no cookie → 401; no profile yet → 404
  `organizer_profile_not_found`; profile exists → 200 with the current fields.
- `PATCH /v1/organizers/me`: no cookie → 401; no profile yet → 404; valid cookie + valid
  partial body → 200 with updated fields reflected in the response and a direct DB read;
  omitted fields stay unchanged; `description` explicit `null` clears it; invalid payload
  → 400.
- CSRF check already covers `POST`/`PATCH` under `/v1` (verified in tests, not assumed —
  same as CR-013).
- Web: `/organizer/profile` — unauthenticated visit redirects to `/login` (shared shell);
  authenticated with no organizer profile yet shows a create form; submitting creates the
  profile and the same screen now shows it in edit mode; edits persist (verified via
  reload); an unverified account sees a clear message instead of a generic error when
  creation is blocked; duplicate-submit protected. `/organizer` (bare) does not 404 for
  an authenticated user. `/me` gains a working link into `/organizer/profile`.
- `turbo run lint/typecheck/build/test` (run separately) all green; `format:check`/
  `lint:root` clean.
- Live check: real Postgres + both dev servers — curl sequence (unauth 401, unverified
  403, valid create 201, duplicate create 409, invalid payload 400, GET 200, PATCH 200
  persisted) plus a real-browser walkthrough via the `browser-automation` skill.

## Planned files

- `packages/db/src/schema/organizer-profile.ts` (new), `schema/index.ts` (+export), new
  migration.
- `packages/types/src/domain/organizer-profile.ts` (new), `src/api/organizers.ts` (new),
  `src/index.ts` (+exports).
- `apps/api/src/modules/organizers/{organizer-profile-response.schema.ts,
organizers.service.ts,organizers.routes.ts,organizers.routes.test.ts}` (new),
  `apps/api/src/routes/v1.ts` (register).
- `apps/web/src/components/cabinet/CabinetShell.tsx` (generalize: `navItems` prop),
  `apps/web/src/app/me/layout.tsx` (pass `PARTICIPANT_NAV_ITEMS` explicitly now),
  `apps/web/src/lib/cabinet/organizer-nav.ts` (new).
- `apps/web/src/app/organizer/{layout.tsx,page.tsx,profile/page.tsx}` (new).
- `apps/web/src/features/organizer/profile/{api.ts,nav.ts,
components/OrganizerProfileForm.tsx,organizer-profile.test.tsx}` (new).
- `apps/web/src/app/me/page.tsx` (+CTA link, additive).
- `packages/ui/src/terminology.ts` (+`ORGANIZER_TERMS`, +`CABINET_TERMS` CTA entries).
- `docs/api.md` (new Organizer section), `docs/database.md` (new entity description).

## Implementation progress

- [x] Plan written (this file)
- [x] `packages/db` schema + migration (`0003_shiny_susan_delgado.sql`), applied
      to `coffee_ride_dev`
- [x] `packages/types` contract additions
- [x] `apps/api` organizers module + tests
- [x] `packages/ui` `ORGANIZER_TERMS`/`CABINET_TERMS` additions
- [x] `apps/web` CabinetShell generalization + organizer cabinet shell/nav + profile
      feature + pages + `/me` CTA
- [x] Full validation (`turbo run lint/typecheck/build/test` together,
      `format:check`/`lint:root`)
- [x] Live check via curl + `browser-automation`
- [x] Context/docs updated (changelog, project-state, architecture-map,
      known-issues, tasks.md, docs/api.md, docs/database.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (all 8 packages, run together against
  a real `DATABASE_URL`): clean. `apps/api` 50 tests (was 38, +12), `apps/web`
  31 tests (was 22, +9), `packages/ui` 85 tests (unchanged — no new component,
  only terminology data), `packages/maps-2gis` 11 tests (unchanged) — all
  green. `next build` compiles `/organizer` and `/organizer/profile` as new
  static routes.
- `pnpm format:check` / `pnpm lint:root`: clean (after one `prettier --write`
  pass this session caught by the same command).
- Live check via curl against a real `apps/api` + the scratch Postgres
  (`coffee_ride_dev`): no cookie → 401; unverified email → 403
  `email_verification_required`; verify email → create 201; duplicate create →
  409 `organizer_profile_already_exists`; empty name → 400 `validation_error`;
  `GET` → 200; `PATCH` rename (description untouched) → 200; `PATCH` clear
  description → 200 (`null`); mismatched `Origin` → 403
  `csrf_origin_mismatch`. Final row cross-checked with a direct
  `SELECT ... FROM organizer_profiles` — matched the HTTP responses exactly.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + the same `apps/api` (both on `localhost` with matching
  `WEB_ORIGIN`, needed for the CSRF check to pass — the first attempt used
  mismatched ports and correctly 403'd, confirming the CSRF check itself
  works rather than being a bug): unauthenticated `/organizer/profile` →
  redirected to `/login`; login → redirected to `/me`; `/me` showed the new
  organizer CTA card; navigated into `/organizer/profile` — loaded in edit
  mode, pre-filled with the account's existing `OrganizerProfile` (created via
  the curl session above); edited the description, saved, saw
  "Изменения сохранены."; reloaded and confirmed the new value persisted, not
  just optimistic local state. No console errors beyond the expected
  pre-login 401 on `/api/v1/auth/me`.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation (not left open):

- `OrganizerProfileForm`'s success-message text was initially derived from
  the `profile` state variable at render time (`profile ? saveSuccess :
createSuccess`), but `setProfile(response.organizerProfile)` — called right
  after a successful _create_ — already flips `profile` to non-null before
  that render, so a fresh create showed the edit-mode success copy instead of
  the create one. Caught by this ticket's own Vitest suite (a test asserting
  the create-success text failed, showing the edit-success text instead)
  before it ever reached the browser check. Fixed by capturing
  `wasCreate = profile === null` before the request and setting an explicit
  `successMessage` string from that captured value, not by re-deriving text
  from `profile` after the state update.
- This changelog/project-state's own prior "44 `apps/api` tests" figure for
  CR-013 was stale — a direct count this session showed the actual pre-CR-014
  total was 38. Corrected in this session's changelog/project-state entries
  rather than silently carried forward.

No open known-issue entries were created by fixing these. One existing known
issue was widened, not duplicated: KI-023 (avatar/photo upload deferred to
the S3 pipeline) now explicitly covers `OrganizerProfile` too, since CR-014
hit the identical gap and scoped it out the same way CR-013 did for `User`.

## Final result

CR-014 complete. `POST`/`GET`/`PATCH /v1/organizers/me` implemented,
creation gated on a verified email and capped at one profile per user.
`/organizer/profile` (create-or-edit in one screen) and a minimal `/organizer`
stub built on a newly-generalized `CabinetShell` shared with the participant
cabinet, plus the first real ADR-009 organizer nav registry and a discoverability
CTA on `/me`. All acceptance criteria met, full validation suite green, live-
verified end to end over both curl and a real browser session. One real bug
(success-message text picking the wrong branch after `setProfile`) found and
fixed by this ticket's own tests, not deferred. `docs/tasks.md`,
`docs/changelog.md`, `.claude/context/project-state.md`,
`.claude/context/architecture-map.md`, `.claude/context/known-issues.md`,
`docs/api.md`, `docs/database.md` all updated. Not yet committed — `git
diff`/`git status` reviewed next; pre-existing unrelated pending changes
(`docs/product.md`) and this session's own unrelated `.mcp.json`/
`skills-lock.json` additions (from earlier in this conversation, not this
ticket) again left untouched and out of scope.
