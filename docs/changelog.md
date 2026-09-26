# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~40 entries, move all but the most recent ~15 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly.
Leave a one-line pointer at the top of this file's history section noting the archive exists.
Commands (`/next`, `/status`) only need to read the last 5-10 entries of the _live_ file —
the archive exists for humans and for deep audits, not for routine agent context.

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed, in 1-3 sentences.
Files: key files/dirs touched.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

---

Entries before CR-115 (CR-000 through CR-114, 2026-09-09..2026-09-23) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26), per this section's own rule — the live file had grown past ~40
entries again.

## 2026-09-23 — CR-115…CR-120 — «Топокарта» redesign, pace groups, rider list

Why: `/impeccable critique apps/web` scored the UI 21/40 — calm but anonymous
("could be an HR portal"), map and route secondary, price louder than the ride. The
product owner chose the «Топокарта» direction (orienteering-map sheet) out of three,
and in the same session asked for pace groups (a ride splits into groups by average
speed, e.g. 25 / 30 / 35 km/h) and a list of everyone who is riding. Built by six
sub-agents in two waves; every wave was re-checked by the main session (diff review,
full test runs, own screenshots) before commit.

- CR-115 (ADR-021): «Топокарта» foundation — white paper / black ink, one plum
  overprint (`primary` #7A2482 / #D79BE0) for route + primary action only; meaning
  inks: `contour` brown (elevation), `info` blue, `success` green, `warning` yellow;
  graphite dark theme. `bg-raised` = `bg`, new `surface`; additive tokens `frame`,
  `primary-hover`, `primary-tint`, `route`, `route-casing`, `contour`, `warning-fill`,
  `on-warning-fill`, `info-tint`. Sofia Sans Condensed as `font-display` (headings,
  labels, metrics, wordmark) — its Russian letterforms come from `locl`, so
  `<html lang="ru">` is now load-bearing. 4px radius, no card shadows. Button
  `danger` became an outline; new additive `danger-filled` used by ConfirmDialog.
  «coffee◦ride» wordmark (dot → control-point ring) + `app/icon.svg`. Glass retired:
  `lib/glass.ts`, `--glass-*` and the `FEATURE_COVER_GLASS_PANEL` flag deleted.
- CR-116: `GET /v1/rides` items are now `PublicRideListItem` (additive):
  `registrationsCount`, `startLabel`, `routePreview` (≤ 40 `[lat, lng]`, thinned in
  SQL then Douglas–Peucker, four batched queries per page), `groups`.
- CR-117 (ADR-022): `RideGroup` entity. Migration `0017_ride_groups`: table
  `ride_groups` (pace 5–60, name 1–60, unique position and lower(name) per ride),
  nullable `group_id` on `registrations` and `waitlist_entries` with a composite FK
  `(group_id, ride_id) → ride_groups(id, ride_id)` so a group can only belong to the
  same ride. Endpoints: owner-only `GET/POST /v1/rides/:id/groups`,
  `PATCH/DELETE /v1/rides/:id/groups/:groupId` (max 6, `group_has_registrations`
  on delete, not editable once finished/cancelled); register / waitlist join take
  optional `groupId` (required when the ride has groups — `422 group_required` —
  checked inside the existing locked transaction; capacity stays ride-level);
  `PATCH /v1/rides/:id/register` changes one's group; `GET /v1/rides/:id` gains
  `groups[]` with counts; organizer participants/waitlist items gain `group`;
  `GET /v1/rides/:id/riders` — signed-in only, display name + group, no ids/contacts.
- CR-118: discovery rebuilt — map is the page (desktop: map left, 440px list
  column right; phone: 45vh map strip over the list, «Список / Карта» toggle
  removed). Legend rows instead of cards: route glyph from `routePreview`, date line
  in the ride's timezone, title as the link, «Старт: …», one metric line with the
  pace range from groups («25–35 км/ч · 2 группы»), seats/difficulty/price as small
  chips. Fixed the old bug where markers never followed filter changes; pins are
  control rings with the start time; row hover/focus draws that ride's route; pin
  click selects the row. maps-core additive: `MapMarkerInput.shape/selected/
haloColor`, `MapRenderOptions.onMarkerClick` (`.claude/rules/maps.md` updated).
- CR-119: ride detail map-first (sticky 7/12 map on desktop), group picker (real
  radios, registration blocked until a group is chosen), «Вы зарегистрированы» block
  with «Сменить группу», «Участники» grouped by group for signed-in viewers
  (anonymous: count + sign-in link), «Условные знаки» legend, «Скачать GPX». The
  sticky mobile registration bar is now default — `FEATURE_STICKY_REGISTRATION_CTA`
  removed.
- CR-120: organizer «Группы по темпу» page (`/organizer/rides/[id]/groups`: add,
  edit, delete with confirm, reorder with buttons, all four API error codes mapped),
  participants page grouped by group with counts, waitlist shows the chosen group.
  RouteBuilder's last waypoint no longer uses danger red.
- Main-session review fixes: one `pluralRu` in `terminology.ts` instead of four
  copies; `formatStartPlace` — a start point labelled just «Старт» showed
  «Старт: Старт», now falls back to the point's description (detail) or is hidden
  (discovery list, which only has the label).

Dev data: dev DB backed up (`packages/db/backups/coffee_ride_20260923T103231Z.dump`)
before applying 0017. «Тестовый заезд на выходные» got «Группа 1» 25 km/h and
«Группа 2» 35 km/h (inserted by SQL, organizer password unknown) with 13 of its 14
riders assigned; test users `test.uchastnik{1,2,3}.cr117@example.com`; a second
test organizer `test.organizer.cr120@example.com` with ride «CR-120 · Проверка групп
по темпу» (3 groups, 4 riders). All test passwords `CoffeeRide-test-2026`.

Incident: a sub-agent ran `pkill -f cat`, which matches every process under
`/Applicat…` — it killed Docker Desktop (test Postgres/Redis) and ended the Claude
session mid-wave. Docker and both containers were restarted, test DB intact.
Sub-agent briefs now forbid broad `pkill -f`/`killall`. Also: running `next build`
while `next dev` serves `apps/web` overwrites the shared `.next` and leaves the dev
server serving 404 chunks — the dev server was restarted with a clean `.next`.

Verification: typecheck + lint clean (17/17 tasks); tests api 417 (+3 skipped, with
`TEST_DATABASE_URL`), web 292, ui 132, maps-2gis 30. Screenshots reviewed by the main
session at 1440 and 390 px (discovery, ride detail anonymous + signed-in dark,
organizer groups and participants).

Next logical task: critique P0 still open — the login bounce loses the ride
(`/login` has no `?next=`), then a 2GIS dark basemap style for the dark theme.

## 2026-09-23 — CR-121 — New wordmark «кофе•райд»

Summary: the header logo «coffee◦ride» (Sofia Sans Condensed 700, ring for the dot) is
replaced with the owner's new logo: a plum elevation-profile mark, then «кофе•райд» in
Golos 800 with a filled plum dot. Rebuilt as inline SVG + text (tokens, both themes)
rather than the supplied raster, which had a baked-in checkerboard. ~20% larger than
before (text-2xl → 1.8rem), per the owner's request. Accessible name is now «Кофе
Райд» so it matches the visible letters (WCAG 2.5.3); page `<title>`s still say
«Coffee Ride». Favicon is now the profile mark.
Files: `packages/ui/src/components/Wordmark.tsx` (+ test), `packages/ui/src/
terminology.ts` (`WORDMARK_TERMS`), `apps/web/src/app/layout.tsx` (Golos 800 loaded),
`apps/web/src/app/icon.svg`, `docs/design.md` §4.
Decisions: none (visual update of ADR-021's wordmark item; the rest of ADR-021 stands).
Follow-up: decide whether page titles switch to «Кофе Райд» too.

## 2026-09-23 — CR-122 — Header bar in one type style

Summary: the header's links and dropdown triggers (Golos 14px 500) looked thin next
to the new «кофе•райд» wordmark (Golos 800). All top-level bar items now share one
class, `NAV_BAR_ITEM_CLASSNAME` in `packages/ui`'s NavMenu — Golos 600, 16px,
tracking −0.01em — used by both `NavMenu`'s trigger and `AppHeader`'s `HeaderLink`,
which previously each carried a copy of the same class string. Dropdown and mobile
menu items are unchanged.
Files: `packages/ui/src/components/NavMenu.tsx`, `apps/web/src/components/site/
AppHeader.tsx`, `docs/design.md` §8.
Decisions: none.
Follow-up: none.

Also in CR-122: the «Заезды» header link's icon is lucide `Route` (a path between
two points) instead of `Home` — the link opens map-first discovery, not a home
page, and `Bike` is already the organizer cabinet's «Мои заезды» icon.
Bar icons (leading icons, the theme icon and the dropdown chevron) are sized once
in `NAV_BAR_ITEM_CLASSNAME` — 18px against the 16px text, gap 8px — instead of
each caller's `h-4 w-4`; dropdown items keep 16px icons.

## 2026-09-24 — CR-123 — Discovery map fullscreen toggle

Summary: the discovery list column (`docs/design.md` §11) is now ~528px (was
440px) at `lg`+, and the map panel gets a fullscreen toggle — a primary-colored
icon button top-left over the map (`isMapFullscreen` state in `DiscoveryList`).
Enabling it takes the map panel out of the grid with `fixed inset-0 z-50`
(same tier as `Dialog`/`Toast`), hiding the list column so rides can be found
directly on the map without the list competing for space; body scroll is
locked while active. Desktop-only (`lg:inline-flex`) — the mobile layout
keeps CR-026's "always show both" design, so the toggle doesn't apply there.
Added `bg-bg` to the map panel so the fullscreen overlay is opaque even in
the degraded (no 2GIS key) placeholder state, instead of showing the header
through the gap.
Files: `apps/web/src/features/participant/discovery/components/
DiscoveryList.tsx`, `packages/ui/src/terminology.ts`
(`RIDE_DISCOVERY_TERMS.expandMapLabel`/`collapseMapLabel`).
Decisions: none.
Follow-up: none.

## 2026-09-24 — CR-124 — Brand purple locked to #9033A1

Summary: `primary` and `route` had quietly drifted into two different purples
(`#7A2482` vs `#9C2AA6` light, `#D79BE0` vs `#DA8FE4` dark) despite ADR-021
calling for one overprint ink — visible as a mismatch between UI accents
(buttons, wordmark, focus ring) and the route/ride-type glyphs on ride cards
and the map. The project owner sampled the intended purple directly off the
rendered UI (macOS Digital Color Meter, RGB 144/51/161 → `#9033A1`) and this
is now locked in as the canonical brand color. Light theme: `--primary`,
`--route`, `--map-route`, `--map-marker-selected` are all `#9033A1`;
`--primary-hover`/`--primary-tint` recomputed to preserve the same hue and
relative lightness/tint relationship as before. Dark theme: `--route` now
matches `--primary` (`#D79BE0`) instead of its own separate shade — kept
lifted from the light value rather than reusing it verbatim, since that's the
documented, accessible value for the near-black background (`docs/design.md`
§3). New contrast ratios recomputed (WCAG 2.1 relative luminance) and still
comfortably clear AA (6.62:1 primary-on-bg light, 8.56:1 dark; full table in
`docs/design.md` §3).
Files: `packages/ui/src/tokens.css`, `apps/web/src/app/icon.svg`,
`docs/design.md` §3, `.claude/CLAUDE.md` (new "Brand color" section pinning
`#9033A1` as what "фирменный цвет" means for this project going forward).
Decisions: none new (a value correction under ADR-021, not a new direction).
Follow-up: none.

## 2026-09-24 — CR-125 — Participant first/last name, per-ride participants-visibility toggle

Summary: the discovery/ride-detail «Участники» rider list (CR-117/CR-119) always
showed `User.displayName` — a free-text nickname — and every ride always showed the
list to any signed-in viewer with no way to turn it off. Two independent additions:

1. **Real name.** `users` gets nullable `firstName`/`lastName` (migration `0018`,
   additive alongside `displayName`, not a replacement — existing nicknames stay
   intact). `PATCH /v1/users/me` accepts both (1-60 chars each, same nullable/
   optional PATCH semantics as every other profile field). Every place a
   participant's name is shown to another user — `GET /v1/rides/:id/riders`, the
   organizer's `GET .../participants`/`.../waitlist` — now computes
   `"{firstName} {lastName}"` when either is set, falling back to `displayName`,
   then `null` (`resolveParticipantName` in `registrations.service.ts`). The
   response field is still called `displayName` in all three — an additive
   behavior change under an unchanged contract, not a new field.
2. **Per-ride privacy toggle.** `rides.participantsVisible` (migration `0018`,
   `boolean not null default true` — every existing/new ride keeps today's live
   behavior unless the organizer turns it off). Editable via `PATCH /v1/rides/:id`,
   using the exact same draft-only gate every other ride setting in this codebase
   already uses (`participantLimit`, cover image, route, ...) — not a new
   precedent. `GET /v1/rides/:id/riders` now checks it for every caller, including
   the ride's own organizer (who already has `/participants` for management):
   `403 riders_hidden` when off. `GET /v1/rides/:id`'s `registrationsCount` is
   untouched — only the named list is gated, matching this ticket's request to
   make the count/list distinction explicit.

Profile form (`/me/profile`): new «Имя»/«Фамилия» fields above the existing field,
which is renamed «Отображаемое имя» (was «Имя») with an updated hint — it's now
explicitly the fallback shown only when first/last name are empty, not the primary
identity. Organizer edit form (`/organizer/rides/[id]/edit`): a new «Показывать
список участников» checkbox, same draft-only disabled state as every other field.
Ride detail's `RidersSection` gets a new state distinct from the existing "sign in
to see this" prompt — a neutral "the organizer hid this" notice on `403
riders_hidden`.

Scope decisions not asked back to the user mid-task (called out here since there
was no follow-up available): visibility scope itself (signed-in-only) is unchanged
from CR-117 — this ticket only adds the on/off switch, not a public/anonymous mode;
the toggle's draft-only editability is a real limitation, tracked as
`.claude/context/known-issues.md` KI-065 rather than silently bypassed with a new
endpoint (that would be a bigger, unrequested precedent change for this one field).

Verified end to end against the running dev server (not just typecheck/tests): a
real HTTP flow — register two users, set one's first/last name, create a draft
ride, publish it with the toggle off, register the other user, confirm
`403 riders_hidden` while `registrationsCount` still shows, flip the toggle on a
second ride and confirm the riders list renders "Иван Иванов" — plus a browser
screenshot of the profile form, the organizer checkbox (disabled + unchecked on
the non-draft ride, matching its actual state), and the "hidden" notice.

Files: `packages/db/src/schema/user.ts`, `packages/db/src/schema/ride.ts` +
migration `0018_participant_name_and_visibility`; `packages/types/src/domain/
user.ts`, `packages/types/src/api/users.ts`, `packages/types/src/domain/ride.ts`,
`packages/types/src/api/rides.ts`; `apps/api/src/modules/auth/auth.service.ts`,
`apps/api/src/modules/users/user-response.schema.ts`, `apps/api/src/modules/rides/
rides.service.ts`, `apps/api/src/modules/rides/ride-response.schema.ts`,
`apps/api/src/modules/registrations/registrations.service.ts`;
`apps/web/src/features/participant/profile/components/ProfileForm.tsx` (+ test),
`apps/web/src/features/organizer/rides/components/EditRideForm.tsx`,
`apps/web/src/features/participant/ride-detail/components/RidersSection.tsx`,
`packages/ui/src/terminology.ts`; `docs/database.md`, `docs/api.md`,
`docs/product.md`.
Decisions: none new (additive fields/behavior under ADR-006's existing
authorization model — no new ADR).
Follow-up: KI-065 (post-publish toggle editing) if it becomes a real ask.

## 2026-09-24 — CR-126 — Rider profile: privacy tiers, garage, self-reported distance stats, recent rides

User request: clickable participant cards from a ride's riders list, a
participant-controlled profile-visibility setting, a "garage" of the
participant's bikes, self-reported distance stats (week/month/year), and a
list of recent rides — a step toward the platform feeling social. Full plan
approved via plan mode before implementation. `.claude/context/known-issues.md`
KI-059 had already flagged this exact gap ("no avatars in the riders list")
and explicitly called for a product decision first plus a _scoped_ avatar
path — this ticket is that decision landing, resolving KI-059. Recorded as
ADR-023 (`docs/decisions.md`) since it establishes the pattern for any future
cross-participant data access: always scoped through a shared ride/
registration, never a bare `GET /v1/users/:id`.

Product decisions confirmed with the user up front (AskUserQuestion, not
assumed): 3-tier privacy (closed / co-participants / open, default
`co_participants`); distance stats are self-reported, not derived from ride
history; bikes are a "garage" — a list, one marked active.

1. **Schema** (migration `0019_real_steve_rogers`): `users` gains
   `profileVisibility` (pg enum, not null, default `co_participants`) and
   nullable `distanceWeekKm`/`distanceMonthKm`/`distanceYearKm` (each with a
   sane-bound CHECK). New `user_bikes` table (`Bike` — a new fixed domain
   entity, ADR-023): `userId`, `bikeType` (reuses `Ride`'s
   `bicycleTypeEnum`), `brand`, `model`, `isActive` — a partial unique index
   enforces at most one active bike per user at the DB level.
2. **API**: `PATCH /v1/users/me` additively accepts the new profile fields.
   New `me`-scoped bike CRUD (`GET/POST /v1/users/me/bikes`,
   `PATCH/DELETE /v1/users/me/bikes/:bikeId`). `GET /v1/rides/:id/riders`
   additively gains `registrationId` per item (opaque, never a raw user id —
   the "no id by design" comment this endpoint carried since CR-117 no
   longer applies, updated to explain why an id is safe now). New
   `GET /v1/rides/:id/riders/:registrationId/profile` and `.../avatar`,
   both gated by one function, `resolveRiderAccess`
   (`registrations.service.ts`): grants the profile owner, the ride's
   organizer, any viewer when `open`, or a fellow rider of _this_ ride when
   `co_participants`; `closed` grants only the owner. Never selects
   `phone`/`email` regardless of tier. "Recent rides" (up to 5) reuses
   `Ride.participantsVisible` as its one visibility rule.
3. **Web**: `/me/profile` gained the visibility select, three distance-stat
   inputs, and a new `GarageForm` (list/add/edit/delete bikes, mark one
   active). New feature module `features/participant/rider-profile/` +
   route `/rides/[id]/riders/[registrationId]` renders the card (bio,
   distance-stat `MetricTile`s, garage, recent rides), with distinct states
   for `riders_hidden`/`profile_private`/not-found/generic-error.
   `RidersSection` now links each rider's name to their card.

Built in three sequential phases (DB/types/API first, fully tested, before
splitting the two independent web pieces — profile settings vs. the new
rider-profile feature — across two parallel subagents, since they touch
disjoint files): this kept the security-sensitive access-control logic under
direct review before any UI was built on top of it.

Verified two ways beyond the automated suites: (1) a real HTTP flow against
the running dev API — two users, one sets bio/stats/an active bike and
`open` visibility, the other (a co-participant) fetches the card and sees
everything but no `phone`/`email`; flipping the owner's setting to `closed`
immediately 403s the same viewer with `profile_private`, `co_participants`
grants them again; (2) a live browser pass (session cookies injected
directly, `browser-automation` skill) over `/me/profile` (visibility
select + distance fields + garage with the created bike, all rendered) and
the riders list → card click-through on a real ride, zero console errors
and zero failed requests at every step.

Environment note: the Docker daemon was unreachable this session, so
`apps/api`'s usual docker-compose `TEST_DATABASE_URL` database didn't exist;
worked around with a local `coffee_ride_test` Postgres database owned by the
current OS user, `TEST_DATABASE_URL` overridden per test invocation (not a
config file change). The S3-dependent tests already mock the AWS SDK wire
call, so this didn't block them; the live-server check above ran with
`app.s3` in its real "error" (unconfigured MinIO) state, which is why avatar
upload wasn't exercised live — covered instead by `apps/api`'s existing
mocked-S3 avatar test suites, extended for the new rider-scoped avatar
route.

Files: `packages/db/src/schema/user.ts`, `packages/db/src/schema/bike.ts`
(new) + migration `0019_real_steve_rogers`; `packages/types/src/domain/
user.ts`, `packages/types/src/domain/bike.ts` (new), `packages/types/src/api/
users.ts`, `packages/types/src/api/bikes.ts` (new), `packages/types/src/api/
rider-profile.ts` (new), `packages/types/src/api/ride-groups.ts`;
`apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/users/
users.service.ts`, `apps/api/src/modules/users/users.routes.ts`,
`apps/api/src/modules/users/user-response.schema.ts` (+ new
`bikes.routes.test.ts`), `apps/api/src/modules/registrations/
registrations.service.ts`, `apps/api/src/modules/registrations/
registrations.routes.ts` (+ new `rider-profile.routes.test.ts`,
`registration-groups.routes.test.ts` updated for `registrationId`);
`apps/web/src/features/participant/profile/api.ts`, `.../components/
ProfileForm.tsx` (+ test), `.../components/GarageForm.tsx` (new, + test),
`apps/web/src/app/me/profile/page.tsx`; new `apps/web/src/features/
participant/rider-profile/` module (`api.ts`, `components/
RiderProfileCard.tsx`, test), new `apps/web/src/app/rides/[id]/riders/
[registrationId]/page.tsx`, `apps/web/src/features/participant/ride-detail/
components/RidersSection.tsx` (+ `ride-detail.test.tsx` updated);
`packages/ui/src/terminology.ts` (`PROFILE_TERMS`/new `GARAGE_TERMS`/new
`RIDER_PROFILE_TERMS`); six unrelated pre-existing test fixtures updated for
`User`'s new always-present fields (`CabinetShell.test.tsx`,
`AppHeader.test.tsx`, `login.test.tsx`, `register.test.tsx`,
`reset-password.test.tsx`, `verify-email.test.tsx`); `.claude/CLAUDE.md`
(domain entity list), `docs/database.md`, `docs/api.md`, `docs/decisions.md`
(ADR-023), `docs/product.md`, `.claude/context/known-issues.md`/
`known-issues-archive.md` (KI-059 resolved).
Decisions: ADR-023 — cross-participant access always scoped through a
shared ride/registration, three-tier `profileVisibility`, one shared
`resolveRiderAccess` gate.
Follow-up: none planned. If a real need appears for viewing a profile
independent of any shared ride, that is a new decision, not a quiet
loosening of `resolveRiderAccess` (ADR-023 "When to revisit").

## 2026-09-24 — CR-127 — Visible sign-out in every cabinet

User request: every cabinet must have «Выйти» so a tester can switch
accounts. Sign-out already existed (CR-108) but only as the one item of the
header's desktop dropdown labelled with the e-mail (and, below `md`, at the
bottom of the burger panel) — the owner could not find it. A failed request
also did nothing visible: `SITE_HEADER_TERMS.logoutError` existed but was
never rendered. Backend verified live first (`POST /v1/auth/logout` → `204`,
then `/v1/auth/me` → `401`) — no API change.
Changed: new `CabinetAccountBar` rendered by `CabinetShell` above every
`/me/*` and `/organizer/*` screen: «Вы вошли как» + first/last name (then
`displayName`, then e-mail alone) + e-mail, and a secondary «Выйти» button
that lands on `/login` (switching accounts is the usual reason to sign out
of a cabinet). New shared `useLogout(redirectTo)` hook
(`apps/web/src/lib/auth/use-logout.ts`) used by both the bar and
`AppHeader` (header still lands on `/`): shows `logoutError` on failure,
treats a `401` (session already gone) as signed out.
`CABINET_TERMS.accountBarLabel`/`signedInAs`/`logoutButton` added.
Files: `apps/web/src/components/cabinet/CabinetAccountBar.tsx` (+ test),
`CabinetShell.tsx`, `apps/web/src/components/site/AppHeader.tsx` (+ test:
failure alert), `apps/web/src/lib/auth/use-logout.ts`,
`packages/ui/src/terminology.ts`.
Validation: web 318/318 + ui 132/132 tests, typecheck and lint clean; live
Playwright run at 1280px and 375px — bar present on `/me` and
`/organizer`, «Выйти» → `/login`, `/me` → `401` afterwards.
Follow-up: none.

## 2026-09-24 — CR-127 follow-up — Login bounced back to /login

Owner report: «не работает кнопка войти». Reproduced live: `POST
/v1/auth/login` succeeded (`/v1/auth/me` → `200` afterwards) but the page
went `/login` → `/me` → `/login`. Root cause (latent since CR-108, made the
main path by CR-127's «Выйти» → `/login`): the root-layout `SessionProvider`
resolves the session once; `LoginForm` never told it about the new
session, so `CabinetShell` saw the stale `anonymous` and redirected back.
Fix: `LoginForm` calls `useSession().refresh()` before `router.replace('/me')`,
and `refresh()` now sets `status` to `loading` synchronously — otherwise the
freshly mounted gate would still act on `anonymous` before the re-fetch
lands. Files: `apps/web/src/features/auth/login/components/LoginForm.tsx`,
`apps/web/src/lib/auth/session-context.tsx`, `apps/web/src/features/auth/
login/login.test.tsx` (now renders inside `SessionProvider`; new regression
test login → cabinet mount, verified to fail without the fix).
Validation: web 319/319, typecheck/lint clean; live: login → `/me`, «Выйти»
→ `/login`, login again → `/me`.

## 2026-09-24 — CR-128 — Light-theme visibility of data graphics

Owner report (screenshot): the «Профиль высоты» chart is barely visible on
the light theme. Cause: a flat `contour`/15% fill (~1.2:1 against white
paper) and a 1.5px stroke further thinned by the SVG's
`preserveAspectRatio="none"`, with no ground line. Fix: 40%→12% vertical
`contour` gradient (id from `useId`), 2px `vector-effect="non-scaling-stroke"`
line, 1px `border-input` ground line. Same audit (live Playwright screenshots
of `/`, `/rides/[id]`, `/login`, light and dark) found `DifficultyScale`'s
empty segments filled with the `border` hairline colour (~1.5:1) — now a
hollow `border-input` outline (≥3:1 in both themes). No token changes; the
«Топокарта» inks stay as they are. `docs/design.md` §3/§6 updated.
Files: `apps/web/src/features/participant/ride-detail/components/
ElevationProfileChart.tsx`, `packages/ui/src/components/DifficultyScale.tsx`,
tests in `ride-detail.test.tsx` and `DifficultyScale.test.tsx`.
Validation: web 319/319 + ui 132/132, typecheck, lint, prettier clean; live
screenshots in both themes confirm both elements read clearly.
Follow-up: selected items in header menus (theme switcher, nav) are marked
only by `bg-surface` (~1.1:1) plus a text-colour change — worth a stronger
selected marker.

## 2026-09-24 — CR-129 — Auto-create the MinIO bucket in local infra

Owner report: avatar upload showed «Загрузка недоступна». Cause: Docker
Desktop was off, so MinIO was down (`/health` → `s3: "error"`) — the degraded
UI state behaved as designed. Recovery also needed a manual `mc mb` (the
second time, KI-015): nothing created the `coffee-ride` bucket on a fresh
volume. Fix: `docker-compose.yml` gains a one-shot `minio-init` service
(same pinned MinIO image, which bundles `mc`; waits for `minio` healthy; `mc
mb --ignore-existing local/coffee-ride`; `restart: 'no'`). Plain `docker
compose up -d` runs it; `up -d minio` alone needs `minio-init` added —
README says so. Local-dev only; `docker-compose.prod.yml` untouched (prod
S3 is provisioned externally).
Validation: `docker compose config -q`; isolated project (`-p crinit`,
ports reset) on a fresh volume — bucket created, exit 0, re-run exit 0, then
torn down with its volume; on the real stack `minio-init` exited 0 and
`/health` → `s3: "ok"`; live avatar upload/download/delete → 201/200/204.
Files: `docker-compose.yml`, `README.md`, KI-015.

## 2026-09-24 — CR-130 — «Ночной старт» visual direction (ADR-024), Phase 1 + partial Phase 2

Owner supplied a v2 mockup ("Ночной старт" — dark-by-default, a route-drawn
cover on every ride, larger tabular numerals) and asked for it to be
implemented. Confirmed explicitly with the owner before starting: this
supersedes ADR-021 («Топокарта») wholesale — not just colour but shape too —
and reverses two recent decisions on purpose: CR-124's locked brand hex
(`#9033A1`/`#D79BE0` → `#82668C`/`#B8A0C1`) and CR-108's header-only organizer
nav (a desktop sidebar returns, still fed by the ADR-009 registry). Recorded
as **ADR-024**, which fully documents the decision and rationale — this entry
covers only the "how"/"what changed".

**Phase 1 (foundation) — done:**

- `packages/ui/src/tokens.css`: `primary` (AA text role) split from new
  `brand` (logo/route track/graphics) and `primary-fill`/`primary-fill-hover`/
  `on-primary-fill` (button fill) — a single overprint ink no longer clears
  AA text contrast at the new hue. `contour` renamed `elevation` (name only).
  New `--cover-*` tokens for `RouteCover`'s theme-invariant dark "window"
  (same pattern as the pre-existing `map-*` tokens, KI-057 unchanged). Radius
  moved from one 4px "stamp" scale to pills/large radii set per component.
- Two new fonts (`apps/web/src/app/layout.tsx`): Unbounded (`font-title` —
  ride titles/headings) and Sofia Sans Extra Condensed (`font-num` — large
  metric numerals); Sofia Sans Condensed narrows to labels/eyebrows only.
- Dark is now the default theme (`apps/web/src/lib/theme/theme.ts`): an
  empty `localStorage` resolves to dark, not `system`. `'system'` is now
  stored as a literal value (not cleared) so an explicit "Система" choice
  stays distinguishable from "never chosen".
- `Button` (pill radius, `primary-fill` role, a real visible spinner while
  `isLoading` — it previously only disabled with no visual indicator),
  `MetricTile` (numerals move to `font-num`; new `variant="cell"` for a
  raised metric cell, default tile unchanged), new `AvatarStack` (overlapping
  avatars + `+N`), new `RouteCover` (a route-drawn SVG cover: decorative
  isoline background picked deterministically per ride, the real route track
  reprojected via a new `projectRoutePreviewToBox` — generalizes the existing
  square-only `projectRoutePreview` — elevation-tinted decorative footer).
  `Wordmark`/`app/icon.svg` move to `brand`.
- `.claude/CLAUDE.md` "Brand color" and `docs/design.md` §1/§3/§4/§5/§6/§9
  updated to match.

**Phase 2 (screens) — partly done:**

- Discovery (`/`): new "Заезды / Карта" tab switch (`DiscoveryTabs`) —
  "Заезды" is a new `RouteCover`-card grid (`RideGrid`/`RideGridCard`,
  fetches its own data, shares metric/status derivation with `RideLegendRow`
  via new `lib/ride-metrics.ts` so the two views can't disagree); "Карта" is
  the unchanged ADR-021/CR-118 map-first `DiscoveryList`. New
  `discoveryStatusTerm` shows a derived "Мало мест" chip on an open ride with
  ≤3 seats left, instead of (not alongside) the ordinary status label.
- Ride detail (`/rides/[id]`): kept the real interactive `RouteMap` hero
  (deliberately — replacing live map functionality with a static decorative
  cover would be a regression, not called for once the existing map-first
  architecture was understood); added a capacity fill bar next to the
  existing "Осталось N мест" text (`role="progressbar"`, colour is
  reinforcement, not the only signal); `GroupPicker` restyled to individually
  bordered rounded rows instead of a divided flat list.
- Organizer (`/organizer`): `CabinetShell` gained an optional
  `sidebarNavItems` prop — a new `CabinetSidebar` renders on desktop when
  passed (now: `/organizer/*` only, from the same `ORGANIZER_NAV_ITEMS`
  registry `AppHeader` still reads); `/me/*` is unchanged (no prop passed).
  `RideSummaryWidget`'s four KPIs now render as individual raised cells
  (`MetricTile variant="cell"`) instead of one shared card — same real data,
  no new numbers invented.

**Not done yet** (tracked in `docs/tasks.md`'s CR-130 entry): organizer
recent-registrations list and per-day bar chart (needs a data-availability
check before deciding whether existing endpoints are enough or this needs a
documented known-issue instead of a new API surface), mobile bottom tab bar,
and a countdown-to-start timer in `RegistrationButton`'s registered block.

Validation: `pnpm --filter ui test/typecheck/lint` and
`pnpm --filter web test/typecheck/lint` all green throughout (ui 137/137,
web 338/338 tests by the end of this entry); browser-automation checks
against the local dev server confirmed dark-by-default renders correctly
(`body` background `#121015`), the new brand purple shows on the Wordmark
and headline numerals, the discovery grid/tab switch and ride-detail fill
bar/`GroupPicker` render as intended, with no console errors.
Files: see `docs/decisions.md` ADR-024's Rollback section for the full list;
new files are under `packages/ui/src/components/` (`AvatarStack.*`) and
`apps/web/src/features/participant/discovery/` (`RouteCover.*`, `RideGrid.tsx`,
`RideGridCard.tsx`, `DiscoveryTabs.*`, `lib/ride-metrics.*`) plus
`apps/web/src/components/cabinet/CabinetSidebar.tsx`.

## 2026-09-26 — CR-130 — «Ночной старт» Phase 2 completed (organizer activity, countdown, mobile tab bar)

Closes CR-130 (ADR-024). Picks up exactly where the 2026-09-24 checkpoint
entry above stopped; everything listed there as "Not done yet" is now built.

- **Organizer «Новые записи» + «Записи по дням».** Data-availability check
  first, as the plan required: `GET /v1/rides/:id/participants` already
  returns `createdAt` (and `group`) per registration, so no new API surface.
  New feature module `apps/web/src/features/organizer/activity/` (ADR-009:
  its own `api.ts`, not an import from `features/organizer/rides`) —
  `RegistrationActivityWidget`, registered as `organizerRegistrationActivityWidget`
  (order 30) in `lib/cabinet/organizer-widgets.ts`. It lists the caller's rides
  (`/v1/rides/mine`), keeps those that can hold registrations inside the
  7-day window (`selectActivityRides`: not draft/cancelled, starting no
  earlier than the window; soonest first; at most 10), fetches each ride's
  participants (following `nextCursor`, ≤3 pages of 100), and aggregates
  client-side: the 5 newest registrations (avatar initials, name, group,
  ride, `formatElapsedShort` — «8 мин»/«2 ч»/«3 дн») and per-day counts in
  the viewer's own time zone (today highlighted; every bar prints its count
  and carries an sr-only sentence, `docs/design.md` §12). The fan-out cost is
  recorded as KI-066.
- **Start countdown.** New `StartCountdown` (ride-detail feature): three
  raised cells, days/hours/minutes to `ride.startsAt`, 30 s client tick,
  `role="timer"` (implicitly not live — no announcement every tick).
  `RegistrationButton` gained an optional `startsAt` prop and shows it at the
  top of the «Вы зарегистрированы» block, except for a
  started/finished/cancelled ride or once the start has passed.
- **Mobile bottom tab bar.** New `components/site/BottomTabBar.tsx`, mounted in
  `app/layout.tsx`, `md:hidden`: Заезды / Карта / «+ Создать» (filled pill) /
  Мои / Я, every icon with a visible label (CR-106's "never icon-only").
  Hidden on `/rides/[id]`, where the sticky «Записаться» bar owns the bottom
  edge (mockup screen 2 has no tab bar either). A spacer keeps it from
  covering page ends; it publishes `--app-bottom-inset`, which `packages/ui`'s
  `Toast` now adds to its bottom offset (additive, default `0px`).
  **Deviation from ADR-024 §8's wording**, flagged for the owner: the ADR says
  the tab bar _replaces_ the header dropdown on mobile; it was built to sit
  _alongside_ the header's hamburger panel instead, because that panel is
  the only mobile route to the organizer menu, the theme control and
  sign-out, none of which fit the mockup's five tabs. Removing the hamburger
  is a one-line follow-up if the owner prefers the ADR's literal reading.
- **Discovery tabs are URL-synced.** `DiscoveryTabs` reads `?view=map`
  (`useSearchParams`) so the tab bar's «Карта» link opens the map; a tab
  click writes the URL with `history.replaceState` (Next keeps
  `useSearchParams` in sync, no server round trip). `app/(public)/page.tsx`
  wraps it in `<Suspense>` (required for `useSearchParams` on a static
  route); `BottomTabBar` does the same with a no-search-params fallback so it
  is still in the prerendered HTML.
- `packages/ui`: `formatShortWeekday` (now also used by `formatRideStartLine`,
  behaviour unchanged), `formatElapsedShort`, `countdownParts`;
  `REGISTRATION_ACTIVITY_TERMS`, `START_COUNTDOWN_TERMS`,
  `BOTTOM_TAB_BAR_TERMS`. All additive.

Validation: `pnpm typecheck` and `pnpm lint` green repo-wide; tests — ui
143/143, web 360/360 (new: `activity.test.tsx`, `BottomTabBar.test.tsx`,
countdown and `?view=map` cases), api 434 passed/3 skipped. The api suite
first failed wholesale: the disposable test DB (`coffee_ride`, Docker
Compose postgres) was one migration behind (`0019`); applying it fixed that —
environment, not a regression (this change touches no API code).
`pnpm --filter web build` passes (all routes still static where they were).
Browser-automation check against the dev server with a temporary organizer,
ride and three registered riders created through the API (deleted from the dev
DB afterwards): dashboard feed/chart in dark and light at 1280px and 390px,
countdown on the ride page (2 дня / 14 часов / 23 минуты), no tab bar on the
ride page, «Карта»/«Заезды» tab-bar links switching the discovery view and URL;
no console errors.

## 2026-09-26 — CR-131 — Organizer dashboard brought to the «Ночной старт» mockup (screen 4)

A side-by-side check of `/organizer` against the ADR-024 mockup (after CR-130)
found the head, KPI set and sidebar still off. Owner decisions: build every
"no backend change" item; sidebar «Участники»/«Обновления» open the **nearest
ride's** pages; no «Статистика» item; the shared site header stays (CR-108 is
not reversed for `/organizer/*`). Frontend only — no API or schema change.

- **Head + KPIs** — new `features/organizer/overview/` (`OrganizerOverviewWidget`,
  registry order 10): the organizer's name as eyebrow, a time-of-day greeting
  (`ORGANIZER_OVERVIEW_TERMS.greeting`), a secondary «Отправить обновление» to
  the nearest ride's updates; four cells — Ближайший («2 дн»/«5 ч»/«< 1 ч»/«Идёт»
  - `formatShortStart` «вс 04.10 · 09:00»), Записано (`N/M` on the nearest ride +
    «+N за сутки»), Лист ожидания (CR-103's all-rides total, «По всем заездам» —
    the mockup names one ride; per-ride waitlists would cost a request per ride),
    Рейтинг (CR-043's aggregate + «N отзывов»). No profile → the «Создать профиль»
    empty state CR-015's card used to show. `MetricTile` gained an optional
    `note`/`noteTone` (additive); `Button`'s classes are now exported as
    `buttonClassName` for links styled as buttons (additive).
- **Retired from the dashboard**: CR-015's `OrganizerProfileWidget` and CR-103's
  `RideSummaryWidget` (and their tests, `getOwnRideSummary` in
  `features/organizer/rides/api.ts`, `RIDE_SUMMARY_WIDGET_TERMS`,
  `ORGANIZER_TERMS.dashboardWidgetTitle/EditLink`) — replaced by the overview
  widget; the profile is still one sidebar click away. The visible
  «Кабинет организатора» title became a screen-reader-only `h1` (the greeting
  is the visual head, as in the mockup).
- **Nearest ride** — one shared definition, `lib/organizer/own-rides.ts`
  (`pickNearestRide`: the `started` ride, else the soonest published one still
  ahead), plus the shared organizer reads the activity widget used to own
  (`listOwnRidesPage`, `listAllRideParticipants`; `features/organizer/
activity/api.ts` removed).
- **Sidebar** — «Обзор» (`/organizer`, not a registry entry: `AppHeader`'s
  dropdown already renders its own overview link) leads; new registry items
  «Участники» (`/organizer/participants`, order 30) and «Обновления»
  (`/organizer/updates`, order 40) render `NearestRideRedirect`, which
  `router.replace`s to the nearest ride's page or shows an empty state linking
  to all rides. «Профиль организатора» moved to order 90 (last). The sidebar is
  a raised panel; an item stays lit on its sub-pages, except the root.
  The mockup's live count badge on «Участники» was not built — registry items
  are static server-built data.
- **«Записи по дням»** — the calendar week пн–вс («эта неделя»), the busiest day
  highlighted in `brand` (was: rolling 7 days, today highlighted); today's
  weekday label is set in the body colour. Counts stay printed above bars.

Validation: `pnpm --filter web --filter ui typecheck/lint` clean; tests ui
147/147, web 369/369 (new: `overview.test.tsx`, `own-rides.test.ts`,
`CabinetSidebar.test.tsx`, `NearestRideRedirect.test.tsx`, calendar-week/peak
cases, `MetricTile` note, `formatShortStart`, greeting terms). Browser check
against the dev server (restarted with a clean `.next` — the deleted widget's
stale module graph made `/` return 500 until then) with temporary API-created
data, since deleted: dashboard in dark/light at 1280px and 390px, «Обзор»
active on `/organizer`, sidebar «Участники»/«Обновления» landing on the nearest
ride's pages; no console errors.

## 2026-09-26 — CR-132 — Organizer cabinet frame per the «Ночной старт» mockup (screen 4)

Continues CR-131: the dashboard body matched the mockup, the cabinet's frame
did not. Owner decisions (2026-09-26): the organizer cabinet gets its **own
header**, as in the mockup — this reverses CR-108/CR-131's "the shared site
header stays" for `/organizer/*` only (`/me/*` is unchanged); and the
**«Участники» count badge** is built, counting the nearest ride's
registrations in the last 24 hours. Frontend only — no API or schema change.

- **Own header** — `components/cabinet/OrganizerHeader.tsx`: wordmark → `/`,
  primary «+ Создать заезд» → `/organizer/rides/new` (icon-only below `sm`),
  and an avatar-initials trigger for the account menu: name + e-mail, «Все
  заезды», «Кабинет участника», the three theme options, «Выйти» (→ `/login`).
  It replaces CR-127's «Вы вошли как … Выйти» bar on `/organizer/*` — identity
  and sign-out stay one click away, now in that menu. `components/site/
SiteChrome.tsx` (root layout) leaves the global `AppHeader` and the 1200px
  content cap off on `/organizer/*`; `OrganizerCabinetFrame` (organizer
  layout) draws the header over `CabinetShell`.
- **Frame** — `CabinetShell` with `sidebarNavItems` now renders an app frame:
  the sidebar is a full-height column with a right border (w-72, 16px items,
  was a floating raised panel) and the page sits beside it (`max-w-6xl`);
  below `lg` the same items render as `CabinetSectionTabs`, a scrolling pill
  row under the header (the organizer header has no section menu).
- **Badge** — `CabinetNavItem.badge?: 'newRegistrations'` (additive, a name
  like `icon`, since descriptors cross the server/client boundary);
  `lib/organizer/nav-badges.ts` resolves it (nearest ride → participants →
  `registrationsInLastDay`, moved from the overview feature into the shared
  `lib/organizer/own-rides.ts` so the KPI note and the badge share one
  definition). Hidden while unknown/zero or on a failed read; a screen-reader
  sentence («3 новые записи за сутки») follows the label.
- **Dashboard details** — KPI numerals one size up (`MetricTile size="lg"`,
  additive); «Лист ожидания» is now the nearest ride's own waitlist («на
  «Рассветный»», one extra `GET /v1/rides/:id/waitlist`), the all-rides total
  only without a nearest ride; «Новые записи» rows read «Анна К. · группа 1»
  (`formatShortPersonName`, new in `packages/ui`) with tinted avatar discs
  (existing `brand`/`success`/`elevation` tokens), the ride's title only when
  the list spans several rides; «Записи по дням» drops the printed counts
  (sr-only sentences stay), zero days keep a short stub.
- **Shared pieces (additive)** — `NavMenu`'s optional `hideChevron`/
  `triggerClassName`; `ThemeToggle` split into `useThemePreference` +
  `ThemeMenuItems` so the account menu lists the options inline instead of
  nesting a menu; `accountName` moved to `lib/auth/account-name.ts` (shared by
  the account bar and the header); terms `ORGANIZER_HEADER_TERMS`,
  `CABINET_NAV_BADGE_TERMS`, `ORGANIZER_OVERVIEW_TERMS.waitlistForRide`.

Validation: `pnpm --filter web --filter ui typecheck/lint` clean; tests ui
152/152, web 384/384 (new: `OrganizerHeader.test.tsx`, `SiteChrome.test.tsx`,
`nav-badges.test.ts`, badge/section-strip cases in `CabinetSidebar.test.tsx`,
frame/account-bar cases in `CabinetShell.test.tsx`, nearest-ride waitlist,
multi-ride rows, `formatShortPersonName`, `NavMenu` chevron, `MetricTile`
size, badge plurals). e2e `critical-journeys.spec.ts` 3/3; `home.spec.ts` fails
independently of this change (KI-067). Browser check against the dev server
with temporary API-created data: `/organizer` at 1280/1024/390 px, dark and
light, account menu open, `/organizer/rides` inside the frame; no console
errors.

Decisions: none new (owner decisions above; no ADR — ADR-024 already calls for
the mockup's organizer layout).
Follow-up: KI-066 (the badge duplicates the overview's reads on `/organizer`);
KI-067; owner decision still pending on the mobile tab bar replacing the
shared header's hamburger panel (ADR-024 §8) — moot inside the organizer
cabinet now, still open elsewhere.

## 2026-09-26 — CR-133 — CR-132 follow-ups (e2e home spec, dashboard read de-dup, e2e auth rate limit, sidebar back links, tab-bar decision)

Summary: closes the follow-ups CR-132's run reported.

- **KI-067 resolved** — `apps/web/e2e/home.spec.ts` now checks both discovery
  views: the default `RideGrid` on `/` and the map-view list on `/?view=map`
  (strings from `RIDE_DISCOVERY_TERMS`/`RIDE_DISCOVERY_ROW_TERMS`).
- **KI-066, duplication part** — `lib/organizer/own-rides.ts`'s `getJson`
  de-duplicates concurrent identical GETs (one shared promise per URL, dropped
  the moment it settles — no TTL, so nothing goes stale after a mutation). The
  sidebar badge, the overview widget and the activity widget mount in the same
  commit, so they share `/rides/mine` and the nearest ride's participants.
  `OrganizerOverviewWidget` now starts its summary/nearest-ride reads alongside
  the profile read (was: after it), otherwise it missed the shared requests;
  without a profile those results/failures are dropped. Live-checked on the dev
  stack: `/organizer` → `/rides/mine` ×1, nearest ride's participants ×1,
  waitlist ×1; `organizers/me` and `mine/summary` ×2 only from dev StrictMode's
  double effect (×1 in production) — 6 requests in production instead of
  ≈ 7 + selected rides. The aggregate endpoint stays KI-066's next action.
- **KI-014 note (e2e 429)** — optional `AUTH_RATE_LIMIT_MAX` (`apps/api/src/
env.ts`) overrides `max` of both auth tiers (per-IP and per-account; the
  per-IP tier also covers verify-email/reset-password), window unchanged;
  `loadEnv()` refuses to start in production when it is set at all. The
  Playwright-started API gets `1000`; an already-running dev API
  (`reuseExistingServer`) needs it in the root `.env` (`.env.example`).
- **Sidebar sections lose the back link** — `/organizer/rides` and
  `/organizer/profile` no longer show «В кабинет организатора»: they are
  sidebar sections, not nested screens, and the sidebar's «Обзор» is the way
  back. `docs/design.md` §8's CR-109 rule now says so; screens below a section
  keep their back links. `BACK_LINK_TERMS.toOrganizerCabinet` removed (unused).
- **Owner decision: mobile tab bar + hamburger coexist** — recorded in
  `docs/design.md` §8 and as an ADR-024 amendment.
- **participantLimit "not saved" (CR-132's test data)** — not an app bug:
  `POST /v1/rides` accepts only title/bicycleType/startsAt/startTimezone
  (CR-017); capacity is set with `PATCH /v1/rides/:id` on the draft, and Zod
  strips the unknown key silently.

Files: `apps/web/e2e/home.spec.ts`, `apps/web/src/lib/organizer/own-rides.ts`
(+ new `own-rides.test.ts`), `features/organizer/overview/{components/
OrganizerOverviewWidget.tsx,overview.test.tsx}`, `app/organizer/{rides,profile}/
page.tsx`, `packages/ui/src/terminology.ts`, `apps/api/src/{env.ts,env.test.ts}`,
`apps/api/src/modules/auth/auth.routes{,.test}.ts`, `apps/web/playwright.config.ts`,
`.env.example`, `docs/design.md`, `docs/decisions.md`.

Validation: web 391/391, ui 152/152, api `env` + `auth.routes` 49/49 with live
Redis (full api suite 438 passed / 4 skipped); web/ui/api typecheck + lint
clean; e2e 5/5 (both home views + 3 critical journeys) against the dev stack.

Decisions: ADR-024 amendment (tab bar and hamburger coexist).
Follow-up: KI-066's aggregate endpoint; `/me/*` sidebar sections still carry
«В личный кабинет» back links (same reasoning would drop them — not done here,
the participant cabinet keeps the shared header).

## 2026-09-26 — CR-134 — CI test env fix + production Docker smoke test

Summary: P0 for CI and the production build.

- **`pnpm test` lost `TEST_DATABASE_URL` (KI-050)** — `turbo.json`'s `test` task
  has a strict env allowlist, so Turbo stripped it and 15+ `apps/api` test files
  failed with "TEST_DATABASE_URL is required". CI runs `pnpm test` too, so the
  CI api suite was failing (KI-050 had wrongly said CI was unaffected). Added
  `TEST_DATABASE_URL`, and `RUN_LIVE_S3_TESTS`, which was stripped the same way
  and made CI's live S3 test skip silently. `DATABASE_URL` is unchanged and
  still separate (KI-049).
- **Web images proxied the API to `localhost:4000`** — Next resolves
  `rewrites()` at `next build` and writes the destination into
  `routes-manifest.json`. `docker-compose.prod.yml` set `API_INTERNAL_URL` only
  as a runtime env var, which the standalone server ignores, so every
  `/api/v1/*` call from a deployed `web` got a 500 (`ECONNREFUSED`). The value
  is now a `web` build arg (`http://api:4000`, set literally). `apps/web/
Dockerfile` refuses to build without it, and the runtime env entry is gone.
  `turbo.json`'s `build`/`dev` env now includes `API_INTERNAL_URL` because it
  changes build output.
- **Production Docker smoke test** — `deploy/smoke/run.sh` (`pnpm
smoke:docker`, new CI job `docker-smoke`) layers `deploy/smoke/
docker-compose.smoke.yml` on the real `docker-compose.prod.yml`. The overlay
  uses its own project `coffeeride-smoke`, adds a throwaway Postgres, disables
  Caddy/backup and pins `api` env literally so CI's job env can't leak in.
  The script builds `api`/`web`/`migrate`, runs the migration, asserts that
  `api` publishes no host port, and requires `GET http://web:3000/api/v1/rides`
  from inside the network to return 200 with an `{ items }` body. On failure
  it prints container logs. It always tears everything down.

Files: `turbo.json`, `package.json`, `.github/workflows/ci.yml`,
`apps/web/Dockerfile`, `apps/web/next.config.ts` (comment),
`docker-compose.prod.yml`, `deploy/smoke/{run.sh,docker-compose.smoke.yml,
smoke.env}`, `docs/deployment.md`.

Validation: `pnpm test` (Turbo, `TEST_DATABASE_URL` exported) passes 5/5
tasks: api 438 passed / 4 skipped, web 391, ui 152, maps-2gis 30, resilience 15. The smoke test **fails** against the pre-fix Dockerfile/compose (500,
`Failed to proxy http://localhost:4000/v1/rides`) and **passes** with the fix
(`200 {"items":[],"nextCursor":null}`), with no containers or volumes left
behind. A `web` build without the arg fails with a clear message.
`format:check`, `lint:root` and web typecheck are clean. This was the first
real `docker build` of all three images (KI-043 resolved). Locally the base
images came from `mirror.gcr.io`, because Docker Hub's CDN doesn't resolve
from Docker Desktop's VM here.

Decisions: none. This fixes the documented ADR-018 topology and does not
change it.
Follow-up: first real GitHub Actions run of `ci` + `docker-smoke`; Caddy and
`backup` are still unexercised (KI-045).

## 2026-09-26 — CR-135 — Expanded critical E2E journeys

Why: P1 from the owner. CR-092 covered only discover → register, create → publish
and "view participants". Waitlist promotion, pace groups, the rest of the
lifecycle, authorization, password reset, profile visibility and notifications
had unit/integration coverage, but no browser journey.

- **Seven new Playwright specs** (`apps/web/e2e/`, 14 new tests, all 17 green):
  - `registration-waitlist`: cancel → the _first_ waitlisted rider is promoted,
    the second stays queued, the canceller is offered the waitlist.
  - `pace-groups`: no group → `422 group_required` + disabled button with the
    hint; picking a group registers; «Сменить группу» persists across a reload.
  - `ride-lifecycle`: draft (404 to the public) → published → open → closed →
    started → finished through `EditRideForm`, then no action button remains;
    cancel path with the native `confirm()` declined then accepted; the public
    page shows the final status.
  - `access-control`: a participant and another club's organizer each get
    403/404 on PATCH/close/cancel/updates/groups and the participants/waitlist/
    updates reads; the ride is unchanged afterwards; the participants screen
    shows two error states. A co-rider's `/riders` and the public ride read
    never contain another rider's email or phone.
  - `password-reset`: «Забыли пароль?» → generic confirmation → reset page →
    the link is single-use → the old password fails, the new one signs in; an
    invalid token is rejected.
  - `profile-visibility`: `open` / `co_participants` / `closed` set on
    `/me/profile`, checked from a co-rider and a signed-in outsider.
  - `notifications`: an update sent from the organizer's screen and the ride's
    cancellation reach the inbox (polled — the Redis queue makes it async);
    opening one clears its «Новое» after a reload, the other stays unread.
- **Helpers**: `api-fixtures.ts` gains `createDraftRide`, `createRideGroup`,
  `joinWaitlist`, `postRideUpdate`, `cancelRide`, `updateMe`, `unsafeRequest`
  and options (`participantLimit`, `startsInMs`); `registerAndVerify` returns
  `userId`, `registerForRide` returns `registrationId` and takes a `groupId`.
  New `helpers/ui.ts` (`loginViaUi` and `newIsolatedRequest` moved out of
  `critical-journeys.spec.ts`, `newSignedInActor`, `confirmInDialog`).
- **`helpers/db-fixtures.ts`**: the one e2e fixture that writes to Postgres.
  It seeds a password-reset token row, because no API returns the raw token
  (always-204 forgot-password, hash-only storage). Test code only; `postgres`
  is a new `apps/web` devDependency (same version as `packages/db`).
- **`RATE_LIMIT_MAX`** (`apps/api/src/env.ts`, `app.ts`): a test/dev-only
  override of the global 100/min/IP limit, set by `playwright.config.ts`.
  Every e2e actor shares one localhost IP, and the bigger suite hit 429 on
  `POST /v1/organizers/me`. Like `AUTH_RATE_LIMIT_MAX`, the API refuses to
  start in production with it set. Two new `env.test.ts` cases.
- **CR-092 discover test**: its ride now starts in an hour. `/` lists upcoming
  rides by start time one page at a time, and a dozen+ new e2e rides per run
  starting in two weeks pushed it off page 1.

Files: `apps/web/e2e/**`, `apps/web/playwright.config.ts`,
`apps/web/package.json`, `pnpm-lock.yaml`, `apps/api/src/{env.ts,env.test.ts,
app.ts}`, `.env.example`.

Validation: `playwright test` 17/17, twice in parallel against an API with no
Redis, and against a Redis-backed API with 1 worker and in parallel. `turbo lint
typecheck` for web + api: 17/17 tasks. api vitest: 440 passed / 4 skipped (two
consecutive runs; one earlier run right after a Docker Desktop restart had 14
failures in one file and did not reproduce).

Decisions: none (the rate-limit override follows the CR-133 precedent).
Follow-up: KI-069 (edit screen shows lifecycle buttons to non-owners).
KI-014 resolved: the Redis-backed run exercised the queue → Worker →
`notifications` row round trip. CI still can't run any of this until KI-068
(MinIO image) is fixed.
