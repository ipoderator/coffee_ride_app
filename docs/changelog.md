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

## 2026-09-26 — CR-136 — Test coverage control

Summary: coverage is now measured and can't silently drop. Every package
with a Vitest suite runs it with v8 coverage, the current numbers are
committed as a baseline, and CI fails a change that falls below it. There
is deliberately no fixed 80% target: the floor only rises, module by module,
API and critical modules first.

- **Measurement**: `@vitest/coverage-v8@5.0.0` in `apps/api`, `apps/web`,
  `packages/ui`, `packages/maps-2gis`, `packages/resilience`; shared options
  in `packages/config/vitest/coverage.js` (`src/**` including files no test
  loads, tests/`test-support`/`.d.ts` excluded, `apps/api/src/server.ts`
  excluded as the process entry). Reporters: text-summary, json-summary,
  html, lcov into each package's `coverage/`. Coverage is only collected by
  the new `test:coverage` scripts/turbo task (`pnpm test:coverage`);
  `pnpm test` is unchanged.
- **Baseline** (`coverage-baseline.json`, measured with the CI environment —
  Postgres, Redis, MinIO, `RUN_LIVE_S3_TESTS=1`): lines/statements/
  functions/branches — api 91.08/89.94/94.60/78.67, web 74.28/72.29/71.32/
  72.88, ui 91.96/92.32/85.60/89.45, maps-2gis 93.78/92.68/85.00/81.11,
  resilience 100/100/100/92.59. `apps/api` is also gated per module (auth,
  registrations, rides, organizers, users, notifications, reviews, plugins,
  lib) so a drop in one can't hide in the total; weakest today:
  notifications (branches 50.94), organizers (55.77), reviews (61.90).
- **Gate** (`scripts/coverage-check.mjs`, `pnpm coverage:check`): fails when
  any metric is more than 0.1 pp under its floor (web varies by ~0.05
  between identical runs; api is exact), prints a Markdown table.
  `pnpm coverage:baseline` (`--update`) raises the floors and refuses to lower one
  without `--allow-decrease`. `--base <file>` makes the base branch's
  baseline a floor too, so a PR can't pass by editing the file.
- **CI** (`ci.yml`): `Test` → `Test (with coverage)`, then the `coverage`
  artifact upload (html + lcov, 14 days, even on failure) and `Coverage gate`
  (table in the job summary; on PRs also against the base branch's baseline,
  overridden by the `coverage-decrease-approved` label — hence the new
  `labeled`/`unlabeled` PR triggers).
- ESLint configs (web, ui, node-library) now ignore generated `coverage/`.

Files: `packages/config/{package.json,vitest/coverage.js,eslint/
node-library.js}`, the five `vitest.config.*` and `package.json`s,
`apps/web/eslint.config.mjs`, `packages/ui/eslint.config.mjs`, `turbo.json`,
root `package.json`, `pnpm-lock.yaml`, `coverage-baseline.json`,
`scripts/coverage-check.mjs`, `.github/workflows/ci.yml`,
`.claude/rules/testing.md`.

Validation: `pnpm test:coverage` 5/5 twice (api 441 passed / 3 skipped, web
391, ui 152, maps-2gis 30, resilience 15); `coverage:check` passes on the
second run; the gate exits 1 against a stricter `--base` file and 0 with
`COVERAGE_ALLOW_DECREASE=1`; `--update` keeps a floor it would lower. `turbo
lint typecheck` 17/17 with no warnings, `lint:root`, `format:check` clean.
The CI side is untested on GitHub: the `ci` job still dies on KI-068.

Decisions: none (tooling; policy lives in `.claude/rules/testing.md`).
Follow-up: KI-070 (two ride-detail tests depend on the shell's MapGL key);
raise the notifications/organizers/reviews floors with targeted tests.

## 2026-09-26 — CR-137 — Files and external integrations: failure and contract scenarios

Summary: scenario tests for S3/MinIO, Redis and 2GIS, which found and fixed
two real defects: a Redis outage stalled every API request for seconds, and
an unexpected 2GIS response body crashed route building with a 500.

- **Redis outage stalled everything (fixed).** Against a Redis on a closed
  port, `GET /v1/rides` took 5 s, register 10.5 s, login > 12 s: the global
  rate limiter runs a command on `app.redis` for every request, and ioredis
  queued it through reconnect attempts. The producer connection
  (`modules/notifications/queue.ts`) now has `enableOfflineQueue: false` and
  `commandTimeout: 500`; `add()` rejects at once while not connected; an
  `onReady` hook waits (≤ 2 s, cut short by a connection error) for the first
  connect so requests right after boot are still rate-limited (CR-058's live
  tests caught that window). Now 11–52 ms per request with Redis down. The
  worker connection is unchanged.
- **2GIS unexpected shapes (fixed).** `route.ts`/`geocode.ts` cast the JSON
  body and crashed on e.g. `{ result: {} }`, a non-list `maneuvers`/`items`,
  or `null` (a 204) for geocode — a raw `TypeError` → 500 from
  `POST /v1/rides/:id/route/build`. Bodies are now narrowed from `unknown`
  (`packages/maps-2gis/src/shape.ts`); anything off-shape is
  `MapProviderError('unavailable')` → 503 `route_builder_unavailable`
  (deliberately not `no_route`); geocode items without numeric coordinates
  are dropped. Also `http.ts`: a real timeout was reported as "request
  failed" because the abort was wrapped before `callWithResilience` saw it;
  it now reads "timed out after N ms".
- **New scenarios**: `file-storage.live.test.ts` (MinIO, over HTTP: GPX
  upload → object → download → replace deletes old object → delete; cover
  upload → object → GET → delete); `degraded-dependencies.test.ts` (S3 and
  Redis at a closed port: `/health` degraded within its timeout, 503
  `route_storage_unavailable`/`cover_storage_unavailable`, ride edit/publish
  and sign-up → publish → register still succeed, each step < 2 s);
  `queue.live.test.ts` (live Redis: registration reaches the inbox via the
  worker); adapter tests for a genuinely hung request (timeout, one retry,
  breaker opens) and eight malformed bodies; API tests for malformed/timeout
  → 503; web test for the `route_builder_unavailable` message.
- **2GIS contract**: `provider.contract.test.ts` (geocode, reverse geocode,
  a road-following cycling route with altitudes, invalid key → 401/403),
  opt-in via `RUN_2GIS_CONTRACT_TESTS=1`; `.github/workflows/maps-contract.yml`
  runs it manually or weekly in the protected `maps-2gis-contract`
  environment, never on PRs, and skips with a notice while the secret is
  missing. Not run live: this machine can't reach the 2GIS API (KI-056) —
  every call timed out, now with the correct message.
- UI and `/health`: `apps/web` still never polls `/health` (KI-041); the chain
  is covered as dependency down → `/health` reports it → API answers the
  documented 503 code → the existing web tests render «Загрузка недоступна»
  for exactly those codes.
- CI sets `RUN_LIVE_REDIS_TESTS=1`; `turbo.json` passes it and
  `RUN_2GIS_CONTRACT_TESTS` to `test`/`test:coverage`. New helper
  `apps/api/src/test-support/app-fixtures.ts`.
- Coverage baseline raised (api total lines 91.08 → 91.89, notifications
  74.42 → 83.97, maps-2gis branches 81.11 → 84.35); web left unchanged, its
  change was run-to-run noise.

Files: `apps/api/src/{degraded-dependencies.test.ts,test-support/
app-fixtures.ts,modules/rides/{file-storage.live.test.ts,
route-builder.routes.test.ts},modules/notifications/{queue.ts,queue.test.ts,
queue.live.test.ts}}`, `packages/maps-2gis/src/{shape.ts,route.ts,
geocode.ts,http.ts,provider.test.ts,provider.contract.test.ts}`,
`apps/web/src/features/organizer/route/route-builder.test.tsx`,
`.github/workflows/{ci.yml,maps-contract.yml}`, `turbo.json`,
`coverage-baseline.json`, `.claude/rules/{resilience.md,testing.md}`.

Validation: `pnpm test:coverage` 5/5 with Postgres/Redis/MinIO and the live
flags (api 459 passed, 0 skipped; maps-2gis 41 + 4 contract skipped; web
392; ui 152; resilience 15), coverage gate passes; the new API tests fail on
the old code (500; journey timeout) and pass on the new; live Redis suites
twice in a row; `turbo lint typecheck` 17/17, `format:check` clean. The 2GIS
contract test and both workflows are untested on GitHub (KI-056, KI-068).

Decisions: none recorded as ADR (resilience rules extended in
`.claude/rules/resilience.md`). Follow-up: KI-071 (notifications dropped
while Redis is down), set up the `maps-2gis-contract` environment + secret.

## 2026-09-27 — CR-138 — Visual and adaptive checks

Summary: seven new Playwright specs covering areas that were previously
untested or only manually audited (CR-044's "Responsive UI" left no
automated artifact) — GPX/media upload flows, route points/stops CRUD,
discovery filters/empty/error states, mobile-cabinet breakpoints,
light/dark/system themes, and the first pixel-diff visual-regression
baselines in this repo.

- **Functional**: `gpx-route.spec.ts` (upload/replace/delete + real
  `gpx_invalid` + mocked `route_storage_unavailable`); `media-uploads.spec.ts`
  (organizer + participant avatar, ride cover — upload/replace/delete +
  storage-unavailable); `route-points-stops.spec.ts` (add/edit/delete for
  both sections); `discovery-states.spec.ts` (unfiltered/filtered empty
  states and an API-failure-then-retry, all mocked via `page.route` for
  determinism against a shared dev/CI database); `mobile-cabinets.spec.ts`
  (organizer sidebar/`CabinetSectionTabs` at `lg`, participant hamburger/
  `BottomTabBar` at `md`); `themes.spec.ts` (light/dark/system → the `.dark`
  class, plus a light/dark screenshot pair).
- **Visual regression**: `visual-regression.spec.ts` — discovery grid, map,
  a ride card, the ride-detail page (registration is inline there, no
  separate route), and the organizer dashboard, each via `toHaveScreenshot`.
  New `mobile` Playwright project (`devices['Pixel 5']` — already
  Chromium-based, so CI's Chromium-only browser install still covers it),
  scoped by `testMatch` to only the specs that need it so the rest of the
  suite still runs once.
- **Determinism traps found and fixed** (documented in
  `.claude/rules/testing.md` "Visual regression" so the next spec doesn't
  repeat them): `GET /v1/rides` sorts soonest-first and pages at 20/max 100
  (`clampLimit`) — a freshly seeded ride can be pages deep on a database with
  other fixtures, so discovery screenshots proxy the real request
  (`route.fetch`) and filter its `items` down to just the seeded ride rather
  than trusting an unfiltered page; `AppHeader` renders a signed-in viewer's
  own (random-UUID) email as visible text, so public-screen fixtures are
  seeded through an isolated `APIRequestContext` instead of `page.request`,
  keeping `page` itself anonymous (the organizer dashboard has no such
  option and masks its account-avatar trigger instead); a start countdown,
  an hour-keyed greeting and a per-day chart all read the browser's own
  clock, frozen with `page.clock.install` against a ride created at a fixed
  absolute `startsAt` (new `createPublishedRideAt` fixture) rather than an
  offset from real `Date.now()`. No map-tile flakiness to fight: CI never
  sets `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`, so `RouteMap`/`DiscoveryMap`
  always render their static placeholder there.
- **Baselines generated to match CI**, not on a developer machine: ran the
  new specs with `--update-snapshots` inside
  `mcr.microsoft.com/playwright:v1.63.0-jammy` (matching the installed
  `@playwright/test` version and CI's `ubuntu-latest`), repo copied in
  (never bind-mounted, so the container's own `pnpm install` never touches
  host `node_modules`), pointed at the host's docker-compose Postgres/Redis/
  MinIO via `host.docker.internal`, `.env` deleted from the copy so nothing
  but explicit env vars (matching `ci.yml`, including an empty
  `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`) could leak in. Verified stable by
  re-running the same 16 tests without `--update-snapshots` before copying
  the 12 resulting `*-linux.png` files out and deleting the container.
- **CI**: `playwright.config.ts` adds `expect.toHaveScreenshot`
  (`maxDiffPixelRatio: 0.02`, `animations: 'disabled'`) and an `html`
  reporter alongside `list`; `ci.yml` uploads `playwright-report/` +
  `test-results/` as an artifact on every e2e run (previously nothing was
  uploaded for a failed e2e run at all).

Files: `apps/web/e2e/{gpx-route,media-uploads,route-points-stops,
discovery-states,mobile-cabinets,themes,visual-regression}.spec.ts`,
`apps/web/e2e/helpers/{mock,fixtures,theme}.ts`, `apps/web/e2e/helpers/
api-fixtures.ts` (new `createPublishedRideAt`), `apps/web/e2e/{themes,
visual-regression}.spec.ts-snapshots/` (12 PNGs), `apps/web/
playwright.config.ts`, `.github/workflows/ci.yml`, `.claude/rules/
testing.md`, `.claude/skills/run-dev/SKILL.md` (new — starting the local
dev stack, unrelated to this ticket's own scope but written up the same
session after manually verifying the app).

Validation: every new spec run repeatedly in isolation and in combination
with the existing 9 specs against a live local stack (Postgres/Redis/MinIO
via docker-compose, migrations applied) — stable, no regressions; the 12
visual baselines generated and verified stable (two consecutive clean runs)
inside the CI-matching Docker container; `pnpm --filter web typecheck`,
`pnpm --filter web lint`, `pnpm format:check` all clean.

Decisions: none recorded as ADR. Known limitation: a transient CPU-
contention timeout was observed exactly once, under a combined ~50-test
local parallel run on a loaded laptop (not reproducible in isolation) —
CI's existing `retries: 2` already covers this class of flake, so no
additional handling was added.

## 2026-09-27 — CR-139 — Load testing suite (P3)

Summary: a separate k6 suite (`load/`) for the six load/concurrency scenarios
`docs/tasks.md` scoped out of the CI gate — registration/waitlist races, rate
limiting, bulk listing, large GPX uploads, and p95/p99 latency. Manual
(`pnpm load:test`) or nightly (`.github/workflows/load-test.yml`), never on
`pull_request`/`push`, same precedent as `maps-contract.yml`.

- **Chose k6 over Artillery**: plain JS scenarios (matches the rest of the
  repo), built-in `checks`/`thresholds` that fail the run's exit code on a
  violated invariant instead of just printing a report, and executors
  (`per-vu-iterations`, `shared-iterations`) that model "N users hit the same
  endpoint at the same instant" directly. Not an ADR — a testing-tool choice,
  not a production architecture change.
- **Six scenarios** (`load/k6/scenarios/`, shared REST helpers in
  `load/k6/lib/api.js` ported from `apps/web/e2e/helpers/api-fixtures.ts`'s
  register/verify/login/organizer/ride-lifecycle flow):
  - `last-slot-registration.js` / `waitlist-promotion-race.js`: exact-count
    and FIFO-order invariants via thresholds — capacity is a correctness
    property here, not a performance budget, so these fail the run the same
    way a broken Vitest assertion would.
  - `rate-limiting.js`: the real 5/min-per-IP auth tier and 100/min global
    tier (`.claude/rules/security.md`) actually reject beyond threshold
    under a genuine concurrent burst, not just a mocked-clock unit test.
  - `bulk-ride-list.js` / `api-latency.js`: `GET /v1/rides` cursor pagination
    stays correct under concurrent readers against a database with many
    rides; p95/p99 baseline for a discovery/detail/health read mix.
  - `gpx-large-route.js`: a near-10 MB, many-trkpt GPX uploads within a
    bound; an over-limit file is rejected fast (`400 gpx_file_too_large`);
    `GET /health` latency stays low from a separate VU throughout the
    upload — the actual claim ADR-015's streaming SAX parser makes, not just
    "does the upload finish."
- **One target-config split**: `AUTH_RATE_LIMIT_MAX`/`RATE_LIMIT_MAX` are
  read once at `apps/api` boot. `rate-limiting.js` needs the real defaults to
  prove they fire; every other scenario needs both raised (same values
  `playwright.config.ts`'s e2e `webServer` already uses) so creating several
  accounts/rides or a sustained read burst from one IP doesn't trip the same
  limiter for the wrong reason. `load-test.yml` runs this as two jobs, each
  booting its own Postgres/Redis/MinIO/`apps/api` — `rate-limit-check`
  (defaults) and `load` (raised).
- **Live-verified**, not just written: installed k6 locally, migrated a
  disposable scratch Postgres database (never `coffee_ride_dev`) and ran two
  real local `apps/api` instances (one per target config) against it, at
  reduced scale. All six scenarios passed every threshold: last-slot race
  (capacity 3 / 3 extra attempts — exactly 3 succeeded, exactly 3 got
  `ride_full`, zero other errors); waitlist race (capacity 3 / 5 waiting —
  the oldest 3 promoted FIFO, the newest 2 left waiting, ride re-filled to
  exactly capacity, no duplicate promotion); rate limiting (exactly 5
  `401`/5 `429` on login, exactly 100 `200`/10 `429` globally); bulk list
  and API latency well under their p95/p99 budgets; GPX upload accepted,
  oversized upload rejected in ~60 ms, concurrent `/health` p95 ~12 ms
  throughout. Scratch database and both scratch API processes torn down
  afterward; the developer's own running dev instance (`:4000`,
  `coffee_ride_dev`) was never touched.
- Root `eslint.config.mjs` ignores `load/**` (k6's `k6/*` import
  specifiers and runtime aren't something a Node ESLint config resolves or
  needs to, same reasoning as the existing `apps/**`/`packages/**` ignores).
  New root script `load:test`.

Files: `load/{README.md,run-all.sh,k6/lib/{config.js,api.js},k6/scenarios/
{last-slot-registration.js,waitlist-promotion-race.js,rate-limiting.js,
bulk-ride-list.js,gpx-large-route.js,api-latency.js}}`,
`.github/workflows/load-test.yml`, `eslint.config.mjs`, `package.json`,
`.claude/rules/testing.md`, `docs/tasks.md`.

Validation: `pnpm format`/`pnpm lint:root` clean; all six k6 scenarios run
live end to end (above) against real local `apps/api` instances on a
disposable database; `.github/workflows/load-test.yml` YAML-parsed
successfully. Not run on GitHub Actions itself (needs a real push/dispatch
to verify job wiring, same standing gap `maps-contract.yml` still has).

Decisions: none recorded as ADR (tooling choice, not an architecture
change). Follow-up: none currently open for this ticket.

## 2026-09-27 — CR-140 — Local/CI S3: SeaweedFS replaces MinIO (KI-068)

Summary: the `ci` job had not run a single step since CR-080 (2026-09-19). Until
~09-24 the MinIO `services:` container pulled but never became healthy — a GitHub
`services:` entry can't pass MinIO's required `server /data`, so the image's bare
`minio` CMD never served — and from ~09-26 the image itself was gone
(`quay.io/minio/minio` and `docker.io/minio/minio` both 401 on anonymous pulls).
KI-068 had recorded only the second half. Every "CI-verified" claim in between was
local-only. Owner decision: SeaweedFS everywhere (ADR-025).

- `ci.yml`, `load-test.yml`: service `minio` → `s3`,
  `ghcr.io/chrislusf/seaweedfs:4.47`. Its default CMD `mini -dir=/data` serves S3
  on 8333 and reads admin credentials from `AWS_ACCESS_KEY_ID`/
  `AWS_SECRET_ACCESS_KEY`, so it works as a plain service container; health check
  `wget …/healthz` (the one unauthenticated endpoint). Port mapped to 9000, bucket
  step (`aws s3 mb`) and every `S3_*` value unchanged.
- `docker-compose.yml`: `minio`/`minio-init` → `s3`/`s3-init` (same image;
  `weed shell` `s3.bucket.create`, a no-op on an existing bucket), new `s3_data`
  volume. No MinIO console on :9001 any more. `.env` needs no change.
- ghcr.io rather than Docker Hub: no anonymous rate limit, and this machine can't
  fetch Docker Hub layers at all right now (`production.cloudfront.docker.com`
  doesn't resolve), while ghcr.io works.
- Dev data: the 6 objects in the old `coffee-ride` bucket (avatars + GPX, 0.3 MB)
  were dumped with their content types, backed up to
  `packages/db/backups/minio-coffee-ride-20260927/` (gitignored) and restored into
  the new service. The old `coffeeride_minio_data` volume and cached MinIO image are
  left in place, untouched.
- `apps/api/src/env.ts`: production placeholder-credential messages say "local dev
  S3 default" instead of "local MinIO default" (values unchanged).
- Docs: README, `run-dev` skill, `.claude/rules/testing.md`, `docs/architecture.md`,
  `load/README.md`, `dependabot.yml` comment. KI-063 (local S3 stopped) resolved and
  archived.

Files: `.github/workflows/{ci,load-test}.yml`, `docker-compose.yml`,
`apps/api/src/env.ts`, `docs/decisions.md` (ADR-025), `docs/architecture.md`,
`docs/tasks.md`, `README.md`, `load/README.md`, `.github/dependabot.yml`,
`.claude/rules/testing.md`, `.claude/skills/run-dev/SKILL.md`, `.claude/context/*`.

Validation: candidate images checked by anonymous manifest request; SeaweedFS 4.47
verified as native binary and as container (anonymous `/` → 403, `/healthz` → 200,
object survives restart, bucket create idempotent). Against the new compose
service: `route-storage.live` + `file-storage.live` + `degraded-dependencies` +
health tests 9/9; dev API `/health` → `s3: "ok"`; a migrated GPX downloaded through
`GET /v1/rides/:id/route/download` byte-for-byte (117 272 B). `pnpm format:check`,
`pnpm lint:root`, api typecheck, `env.test.ts` 11/11, workflow YAML parses. Not
run: Playwright upload specs locally (they reuse the running dev servers with
production rate limits and the dev DB) and the GitHub `ci` run itself — both need
the push.

Decisions: ADR-025. Follow-up: close KI-068 after the first `ci` run passes service
start; expect that run to surface whatever broke unnoticed since 2026-09-19.

## 2026-09-27 — CR-140 follow-up — first real CI run: web tests pinned to one time zone

Summary: the first `ci` run after CR-140 (`36322844930`) initialized the SeaweedFS
service and passed install, migrations, bucket creation, format, both lint steps
and typecheck — the first time since 2026-09-19. KI-068 resolved and archived.
It then surfaced one test that had only ever run on Moscow machines:
`overview.test.tsx` freezes a _local_ 08:00 as "now" (for the «Доброе утро»
greeting), so the «Ближайший» countdown to a fixed UTC start was «2 дн» in MSK and
«1 дн» on the UTC runner. The widget is right (whole elapsed days); the suite was
zone-dependent. `apps/web/vitest.config.mts` now sets `process.env.TZ =
'Europe/Moscow'` before workers spawn, so dev and CI agree; web suite 392/392
with the shell at UTC, America/Los_Angeles and Asia/Vladivostok.

`docker-smoke` failed inside `next build` with a `next/font` Google Fonts error
(`Cannot read properties of null (reading '1')` — the fetched CSS lacked an
expected `src: url(...)`). No font, dependency or Dockerfile change since its last
green run (`ce7050d`), and Google Fonts returns all five families correctly now, so
it is treated as transient and re-checked by the next run rather than "fixed".

Files: `apps/web/vitest.config.mts`, `.claude/context/{known-issues,known-issues-
archive,project-state}.md`, `docs/tasks.md`.

Decisions: none. Follow-up: if `docker-smoke`'s font fetch fails again, make the
production build independent of Google Fonts at build time (self-host the files).

## 2026-09-27 — CR-141 — Return to the ride after sign-in (`/login?next=`, KI-064)

Summary: closes the P0 of the 2026-09-23 UI critique. An anonymous visitor's
«Зарегистрироваться» on `/rides/[id]` (and the «Участники» / rider-profile sign-in
links) sent them to a bare `/login`; after signing in they landed on `/me` and the
registration intent was lost. They now go to `/login?next=/rides/:id` and come back
to the ride; «Нет аккаунта?» → `/register?next=` hands it on to `/login` (form link
and a new «Войти» link on the success card — registering doesn't sign in, but an
unverified account can sign in and register for a ride right away).

- `apps/web/src/lib/auth/next-path.ts` — the one validator (`safeNextPath`) and
  href builders (`loginHref`/`registerHref`). Open-redirect protection: only a
  same-origin relative path survives; absolute and protocol-relative URLs,
  backslashes, control characters (tab/newline can smuggle `//host` past a naive
  check), >512 chars and `/login`/`/register` themselves (checked after URL
  normalization, so `/rides/../login` is caught) are dropped. Applied twice: the
  page validates `searchParams.next` server-side, `LoginForm` re-checks right before
  `router.replace`.
- `/login`/`/register` pages are now `async` and read `searchParams` (Next 15
  Promise form, same as `/verify-email`); forms take an optional `next` prop.
- `RegistrationButton` (401), `RidersSection`, `RiderProfileCard` pass the ride /
  rider-profile path. `AUTH_TERMS.registerSuccessLoginLink` added (additive).
- Out of scope, unchanged: header «Войти»/«Регистрация» and `CabinetShell`'s
  anonymous redirect still land on `/me`; the email-verification link can't carry
  `next` (email/API contract).

Files: `apps/web/src/lib/auth/next-path{,.test}.ts`, `apps/web/src/app/(public)/
{login,register}/page.tsx`, `features/auth/{login,register}` (forms + tests),
`features/participant/ride-detail/components/{RegistrationButton,RidersSection}.tsx`,
`features/participant/rider-profile/components/RiderProfileCard.tsx` (+ tests),
`apps/web/e2e/login-return.spec.ts`, `packages/ui/src/terminology.ts`,
`docs/auth.md`.

Validation: validator 23 cases; login returns to `next` / ignores `//evil.example` /
keeps it on the register link; register keeps it on both login links; ride-detail
401 pushes `/login?next=%2Frides%2Fride-1`. Web 420/420, ui 152/152, typecheck,
lint, format clean. `e2e/login-return.spec.ts` (ride → register click → login →
back on the ride → registered) passed against the local dev stack — it left one
e2e organizer, ride and participant in the dev database.

Decisions: none. Follow-up: KI-064 resolved and archived.

## 2026-09-27 — CR-142 — Notifications no longer dropped while Redis is down (KI-071)

Summary: with `REDIS_URL` configured but Redis unreachable, every notification
producer used to log the failed enqueue and drop the notification. A job the
queue provably never accepted is now delivered directly, exactly as a
Redis-less deployment delivers it.

- `notifications.service.ts`: new `NotificationQueueUnavailableError` and one
  `enqueueOrDeliver` helper shared by all producers. The fallback runs only on
  that error — thrown by `queue.ts`'s `add()` for its two pre-flight rejections
  (circuit open, producer connection not `ready`), before anything is sent to
  Redis, so it cannot duplicate a job. A timeout or mid-command error may have
  landed in Redis: still logged only.
- Covered: in-app `registration_confirmed`, `ride_update`, `ride_cancelled`;
  the verification email (there is no resend endpoint, and `/register` already
  answers 409 for a taken email, so the extra latency reveals nothing).
- Not covered, deliberately: the password-reset email. Sending it directly only
  for real accounts would make `/forgot-password` latency an account-existence
  oracle (`.claude/rules/security.md`); the user can re-request once Redis is
  back.
- Everything stays log-and-swallow; the triggering action never fails.

Files: `apps/api/src/modules/notifications/{notifications.service,queue}.ts`,
`notifications.service.test.ts` (new), `queue.test.ts`,
`apps/api/src/degraded-dependencies.test.ts`, `.claude/rules/resilience.md`.

Validation: new service suite (6 cases: direct insert/fan-out/verification on
unavailable, no fallback on a timeout, failing direct insert swallowed, reset
email never sent directly); `queue.test.ts` asserts which rejections carry the
error class; `degraded-dependencies.test.ts` (real Postgres, Redis on a closed
port) now checks the rider's inbox has the confirmation — it fails with the old
`queue.ts`. apps/api notifications/registrations/auth/rides + degraded suites
331/331, live Redis queue suite passed, typecheck/lint/format clean. Coverage
baseline not regenerated (new tests only add coverage).

Decisions: the fallback policy above (resolves KI-071's open product/resilience
question). No schema, API contract or dependency change. Follow-up: KI-071
resolved and archived.

## 2026-09-27 — CR-143 — Edit-screen ownership check (KI-069) + MapGL-key test isolation (KI-070)

Summary: two small, independent fixes bundled together — both quick and both left
open from earlier CRs.

KI-069: `/organizer/rides/[id]/edit` loads the ride through `GET /v1/rides/:id`,
which CR-023 made the shared public ride-detail read — a non-owner viewing a
`published`+ ride got `200`, not `404`, so `EditRideForm` rendered the full form
and lifecycle buttons for a ride that wasn't theirs (every action was still
rejected server-side; this was a confusing screen, not an authorization hole).
`GetRideResponse` gains an additive `isOwner: boolean`, computed server-side from
the already-existing ownership check (identity from the verified session only,
never client-supplied). `EditRideForm` now shows its not-found state when
`isOwner` is `false`. `e2e/access-control.spec.ts` tightened from accepting
either outcome to asserting the not-found state and no lifecycle button.

KI-070: `ride-detail.test.tsx`'s two map-panel tests assumed no MapGL key is
set, but `createMapRenderer()` reads `process.env` at call time — a shell that
had sourced `.env` (a real key) made them try a real 2GIS render instead of the
degraded placeholder they assert on. The suite's `beforeEach`/`afterEach` now
own the precondition (`vi.stubEnv`/`vi.unstubAllEnvs`), independent of the
invoking shell.

Files: `packages/types/src/api/rides.ts`, `apps/api/src/modules/rides/
{rides.routes,rides.service,rides.routes.test}.ts`, `apps/web/src/features/
organizer/rides/{api,rides.test}.tsx`, `apps/web/src/features/organizer/rides/
components/EditRideForm.tsx`, `apps/web/src/app/organizer/rides/[id]/edit/
page.tsx`, `apps/web/src/features/participant/ride-detail/ride-detail.test.tsx`,
`apps/web/e2e/access-control.spec.ts`, `docs/api.md`.

Validation: new API case (non-owner session on a published ride → `isOwner:
false`) plus two existing cases extended with the assertion; new web case
(non-owner response → not-found, no save button) — both fail against the old
code (mutation-checked). Full apps/api suite 457/457, apps/web suite 421/421;
`ride-detail.test.tsx` also run with the real `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`
exported, 50/50. Typecheck/lint/format clean across apps/api, apps/web,
packages/types.

Decisions: none new. Follow-up: KI-069 and KI-070 resolved and archived.

## 2026-09-27 — CR-144 — Discovery grid card redesign («B2»)

Summary: the product owner found the `/` grid card cluttered — status, date,
title, three unlabelled metrics and seats were all stacked over the route art
at low contrast. Three mockups were built (a claude.ai design canvas); they
chose «B» (cover + panel), asked for it refined («B2»), then implemented.

- `RouteCover` now carries only the route track and the status chip (fixed
  160px, new 400×160 isoline backgrounds, no elevation silhouette, no scrim,
  no `children`/`topRight` slots — the card was their only caller; docs said it
  was also the ride-detail hero, which was no longer true). No route → a
  «Маршрут пока не загружен» caption. The chip sits in a `dark` token scope,
  so its tone ink stays legible on the always-dark cover in the light theme.
- `RideGridCard` puts everything else on a theme-aware `bg-raised` panel:
  start line, a title always two lines tall (grid rows align), three labelled
  metric columns (`METRIC_TERMS`; «—» for a missing one; groups count under the
  pace; one «Дистанция и темп не указаны» line when all three are missing;
  elevation in the `elevation` ink, not the cover's purple), seats («17 из 20
  участников» + «Осталось 3 места» + a fill bar; no limit → count + «Без
  ограничения мест»; cancelled → none) and bike/difficulty/price chips.
  Hover: `border-input` border + 2px lift (`motion-safe`).
- Behaviour change: an open ride with no seats left now reads «Список
  ожидания» (info) instead of a green «Регистрация открыта» —
  `joinWaitlist` accepts exactly that state. Map-tab legend rows unchanged.
- Fixed in passing: a cancelled ride's chip lost its red fill on the cover
  (the card's `bg-cover-bg/85` override was merged over `bg-danger`, leaving
  near-black text on near-black).
- `packages/ui` (additive): `RIDE_DISCOVERY_TERMS` gains `waitlistStatusLabel`,
  `routeMissing`, `metricsMissing`, `seatsTaken`, `participantsCount`,
  `noSeatsLimit`; `DifficultyScale` gains optional `size="sm"` (default
  unchanged — other call sites untouched).
- `lib/ride-metrics.ts`: `buildRideCardMetrics`, `rideCardSeats`; the pace
  derivation is shared with `buildRideRowMetrics` (`ridePace`).

Files: `apps/web/src/features/participant/discovery/components/{RideGridCard,
RideGridCard.test,RouteCover,RouteCover.test,RideGrid}.tsx`,
`apps/web/src/features/participant/discovery/lib/ride-metrics{,.test}.ts`,
`packages/ui/src/{terminology,terminology-discovery.test}.ts`,
`packages/ui/src/components/DifficultyScale{,.test}.tsx`, `apps/web/e2e/
visual-regression.spec.ts-snapshots/{discovery-grid,ride-card}-{chromium,
mobile}-linux.png`, `coverage-baseline.json`, `docs/design.md` (§1, §6 «Ride
grid card», §9).

Validation: new `RideGridCard.test.tsx` (9 cases) plus metric/seats/status
and term/`DifficultyScale` unit cases; the waitlist branch was mutation-checked
(removing it fails 2 tests). Full suites in the CI environment (Postgres,
Redis, S3, live flags): api 465/465, web 439/439, ui 155/155, maps-2gis,
resilience green; typecheck/eslint/prettier clean for web and ui. Live check
on the dev server, dark and light themes, desktop and Pixel 5. Visual
baselines regenerated in `mcr.microsoft.com/playwright:v1.63.0-jammy` against
the host's compose stack (as CR-138), then re-run without updating: 16/16.
Coverage baseline raised (web +0.4 pp, ui +0.1 pp; api rows raised by
CR-142/143's tests too); no row decreased. `next build` not run locally (it
clobbers the running dev server's `.next`).

Decisions: none new (within ADR-024; product owner chose the direction).
Follow-up: KI-073 (dark-on-dark layout changes slip under the screenshot
tolerance).

## 2026-09-28 — CR-145 — Known-issues sweep: KI-072, KI-062, KI-061, KI-058, KI-073, KI-044

Summary: six open known issues closed in one pass, each with its own
verification; KI-045 narrowed, KI-056 re-checked, KI-074 recorded. Commit per
KI if split (they touch disjoint files except the context docs).

- **KI-072 — Dependabot.** The `dev-dependencies` group is minor/patch only
  (`.github/dependabot.yml`); majors (TypeScript 7 in PR #24) come as their
  own PRs instead of failing CI for 12 unrelated patches.
- **KI-062 — group pace step. Contract tightening:** `RIDE_GROUP_PACE_STEP_KMH`
  (0.5) in `packages/types` now feeds `groupPaceSchema` (`.multipleOf`) and the
  editor. `POST`/`PATCH /v1/rides/:id/groups` with a pace off the step (e.g.
  27.3) now returns `400 validation_error`. The web editor already rejected
  those values, so no caller changes; the DB CHECK (5–60) is unchanged.
- **KI-061 — ride sub-page links registry.** `RideSectionLink` descriptors
  (`lib/cabinet/types.ts`), one `ride-section.ts` per owning feature (route,
  cover-image, groups, participants, updates), `lib/cabinet/
organizer-ride-sections.ts`. `edit/page.tsx` flag-filters and passes the
  list to `EditRideForm`'s new optional `sections` prop. Same links, same order.
- **KI-058 — route preview at write time. Migration `0020_route_preview`:**
  nullable `routes.preview jsonb` (CHECK is-array), filled by
  `buildRoutePreview` on every route write (GPX upload/replace, 2GIS build)
  from the full geometry; `GET /v1/rides` reads it instead of sampling each
  route in SQL. Backfill: even-stride ≤ 40-point sketch for existing rows
  (dev only — no production data). Response contract unchanged.
- **KI-073 — dark-theme screenshots.** The per-pixel `threshold` (0.2) made
  `bg`/`bg-raised`/`surface`/`border` compare equal (YIQ deltas 37–358 vs a
  1409 cut-off). `threshold: 0.02` (cut-off 14) in `playwright.config.ts`.
- **KI-044 — client IP behind Caddy.** Measured: Caddy overwrites a
  client-sent X-Forwarded-For; Next's rewrite forwards it unchanged without
  appending. `api` trusted nothing, so every production request would have
  shared `web`'s rate-limit bucket. New optional `TRUST_PROXY_HOPS`
  (`apps/api/src/env.ts`) → `lib/trust-proxy.ts` (trust ≤ N hops, private
  addresses only — Fastify 5 ignores a bare hop count); prod compose sets 1;
  `.env.example` documents it.
- **KI-045:** `deploy/Caddyfile` passes `caddy validate` (v2.11.4). ACME/TLS and
  `backup` remain unverified.
- **KI-056 / CR-114:** 2GIS REST still unreachable from this machine (VPN).
  `provider.contract.test.ts` gained the unroutable-pair case (`no_route`).
  The `maps-contract.yml` workflow has never run — its environment/secret
  don't exist.
- **KI-074 (new):** `next build` fetches five Google Fonts families; a bad
  response fails the build (CI run `36345478610`, green on re-run).

Files: `.github/dependabot.yml`; `packages/types/src/{domain/ride-group,
api/ride-groups}.ts`; `apps/web/src/features/organizer/groups/validation.ts`;
`apps/web/src/lib/cabinet/{types,organizer-ride-sections,
cabinet-registries.test}.ts`, `apps/web/src/features/organizer/{route,
cover-image,groups,participants,updates}/ride-section.ts`,
`apps/web/src/features/organizer/rides/{components/EditRideForm,
rides.test}.tsx`, `apps/web/src/app/organizer/rides/[id]/edit/page.tsx`;
`packages/db/src/schema/route.ts`, `packages/db/migrations/
{0020_route_preview.sql,meta/}`; `apps/api/src/modules/rides/{rides.service,
route-preview,route-preview.test,ride-groups.routes.test,
route-builder.routes.test}.ts`; `apps/web/playwright.config.ts`;
`apps/api/src/{env,app,app.test}.ts`, `apps/api/src/lib/trust-proxy{,.test}.ts`,
`docker-compose.prod.yml`, `deploy/smoke/run.sh`, `.env.example`;
`packages/maps-2gis/src/provider.contract.test.ts`; `coverage-baseline.json`;
`docs/{api,database,deployment}.md`, `.claude/rules/testing.md`,
`.claude/context/{known-issues,known-issues-archive,architecture-map,
project-state,current-task}.md`, `docs/tasks.md`.

Validation: typecheck + lint repo-wide (17/17 tasks). Coverage run in the CI
environment (Postgres, Redis, S3, live flags, no MapGL key): api 489/489, web
440/440, ui 155/155, maps-2gis 41 (+5 contract skipped), resilience 15/15;
`coverage:check` green, baseline raised (api total +0.06 pp lines, `lib/`
+0.57 pp). One earlier full turbo run had `avatar.routes.test.ts` fail in its
`beforeEach` (`DELETE FROM users`); not reproduced in three full api runs
since. Per item: migration applied to a fresh database, the test DB and the dev
DB (dev backfill: 1865-point route → 39 preview points). `pnpm smoke:docker`
green with the new KI-044 step (client A 99 → 98 → 97 incl. a forged left
entry, client B 99). KI-073 in `mcr.microsoft.com/playwright:v1.63.0-jammy`:
the dark `--bg-raised` set to `--bg` passed all 16 screenshots at the old
config and failed 7 at 0.02; restored, 16/16 twice. That container was arm64 —
CI's x86_64 run is the first check of 0.02 against the committed baselines.

Decisions: 0.5 km/h is a real API rule (KI-062); `api` trusts one private
proxy hop in production (KI-044). No ADR — both stay within ADR-011/ADR-018.
Follow-up: watch the first CI run for KI-073's threshold; KI-074 (self-host
fonts); CR-114 live check once 2GIS is reachable.

## 2026-09-28 — CR-145 follow-up — x86_64 visual baselines

Summary: CR-145's first CI run (`36383157672`) failed only in E2E: five
screenshots (`ride-card` chromium + mobile; `discovery-grid`, `discovery-map`,
`ride-detail` mobile) differed from their baselines by 3–4 % of pixels (21 % for
the mobile card), identically on all three retries. Every other step and
`docker-smoke` were green. Cause: those baselines were rendered in the arm64
Playwright image on an Apple Silicon Mac (CR-138/CR-144's procedure); CI's
x86_64 runner rasterises glyphs and the cover's thin isolines slightly
differently. The old `threshold: 0.2` hid that; CR-145's 0.02 exposes it. The
CR-145 entry's note that CI would be "the first check" was the check, and it
failed.

- The five baselines are replaced with the `*-actual.png` renders from that
  run's `playwright-report` artifact, after confirming each `*-diff.png` marks
  only glyph/isoline anti-aliasing — no panel, border or layout pixels — and
  that the actual render matches the approved CR-144 card. The other 11
  screenshots already passed on CI at 0.02 and are unchanged.
- `.claude/rules/testing.md`: baselines must be x86_64 — `docker run
--platform linux/amd64 …`, or take CI's actual renders from the artifact.

Files: `apps/web/e2e/visual-regression.spec.ts-snapshots/{ride-card-chromium,
ride-card-mobile,discovery-grid-mobile,discovery-map-mobile,
ride-detail-mobile}-linux.png`, `.claude/rules/testing.md`,
`.claude/context/project-state.md`, `docs/changelog.md`.

Validation: the follow-up CI run is the check (no local x86_64 renderer).

## 2026-09-28 — CR-147 — First live 2GIS contract run

Summary: this machine's VPN egress can't reach the 2GIS REST APIs (KI-056), so
the contract test ran on GitHub's runners instead. Created the
`maps-2gis-contract` environment (deployment branches: `main` only); the owner
added the `MAPS_2GIS_API_KEY` secret. Four dispatches of `maps-contract.yml`:

- `36386689239` (before fixes): geocode/reverseGeocode pass; three failures,
  each a real adapter defect or a wrong test premise.
- Routing altitudes are centimetres — central Moscow came back as 15820. The
  adapter passed them through as metres, so a built route's GPX (and every
  elevation gain derived from it) would have been ×100. Now ÷100.
- The Catalog API reports errors as HTTP 200 with the status in `meta.code`;
  an invalid key resolved to `[]` ("nothing found"). Now `meta.code` 404 → no
  results, any other non-200 → `MapProviderError` with that status.
- Moscow → Reykjavik answered 403: `"excessive distance between points for
demo-keys, max (km): 50"` (read via a temporary diagnostic test, run
  `36387194155`) — the key is a demo key (KI-075). The `no_route` case now uses
  Rabocheostrovsk → Solovki (island, no bridge, ~44 km), which answers HTTP 200
  `{type:'error', status:'ROUTE_DOES_NOT_EXISTS'}` (run `36387334632`) — the
  adapter read that as an unexpected shape (`unavailable`, 503). Now
  `no_route` (422); other HTTP 200 routing errors stay `unavailable`.
- `36387478533` on `0d8d57c`: 5/5 green. CR-114's two open questions
  (`need_altitudes` gives Z per vertex; what an unroutable pair returns) are
  answered, and CR-114 is checked off.

Files: `packages/maps-2gis/src/{route,geocode}.ts`, `provider.test.ts` (four
new cases, altitude fixture in centimetres), `provider.contract.test.ts`
(island pair; the diagnostic was removed once answered),
`.claude/context/{known-issues,project-state,current-task}.md`,
`docs/tasks.md`.

Validation: maps-2gis unit tests 45 passed, typecheck, lint; live contract run
green. apps/api's rides suites were not run locally (need `TEST_DATABASE_URL`);
they mock `MapProvider` and no apps/api code changed — CI covers them.

Found: KI-075 (demo key: routing refuses points over 50 km apart, surfaced as
503 "unavailable"); bicycle routes may include ferries (Vladivostok → Popova
island). KI-056 narrowed to local reachability only.

## 2026-09-28 — CR-147 follow-up — route-builder test fixture in centimetres

Summary: CI run `36387610343` on `b207fd8` failed in `Test (with coverage)`:
`route-builder.routes.test.ts` feeds the real 2GIS adapter a mocked Routing
answer whose altitudes were written in metres (100/130/120), so after CR-147's
÷100 the ride's elevation gain came out 0 instead of 30. The CR-147 entry's
assumption that apps/api only mocks `MapProvider` was wrong for this suite. The
fixture now uses centimetres (10000/13000/12000), as 2GIS sends them.

Files: `apps/api/src/modules/rides/route-builder.routes.test.ts`.

Validation: `src/modules/rides` against the Docker test database — 197 passed,
3 skipped (live suites); route-builder 12/12.

## 2026-09-28 — CR-148 — Demo data seed (`pnpm seed:demo`)

Summary: the dev database held ~250 leftover e2e accounts (`@example.test`,
`@example.com`) and ~150 of their rides. With the owner's approval they were
deleted (dump kept outside the repo first; the owner's own accounts and two
rides untouched), and a repeatable demo seed was added.

- `packages/db/src/seed-demo.ts` (`pnpm seed:demo`, root → `db`): resets every
  `@demo.coffeeride.local` account and its rides, then drives the running API
  over HTTP — 3 organizers with profiles, 8 riders with names/bikes/monthly
  distance, 9 Moscow-area rides covering every state (4 open, one full with a
  2-person waitlist, one registration-closed, 2 finished with 7 reviews, one
  draft, one cancelled), pace groups, stops, typed route points, ride updates.
- Routes are built by the app's own route builder (`POST /v1/rides/:id/route/
build`, 2GIS, bicycle), per the owner — consecutive waypoints stay under
  50 km (KI-075). The first build is the 2GIS preflight: unreachable → the run
  stops before publishing, with a KI-056 hint. `--no-routes` skips the step.
- Guards: refuses `NODE_ENV=production` and any non-localhost `DATABASE_URL`/
  API URL; waits out 429s. Reads the root `.env` itself.
- Local `.env` (not committed): `AUTH_RATE_LIMIT_MAX`/`RATE_LIMIT_MAX` dev
  overrides from `.env.example`, so a seed run isn't throttled.

Files: `packages/db/src/seed-demo.ts`, `packages/db/package.json`,
`package.json`, `README.md`, `docs/tasks.md`, `.claude/context/*`.

Validation: db typecheck + lint; `pnpm seed:demo` without routes — every step
ok, public list shows the 5 upcoming published demo rides; with routes it
stopped at the preflight as designed (2GIS unreachable through the VPN).

Next: run `pnpm seed:demo` once 2GIS is reachable from this machine, then
check CR-148 off.

## 2026-09-28 — CR-149 — Organizer cabinet links to the rider profile card

Summary: the owner asked to open a participant's profile straight from the
organizer cabinet. A name in `/organizer`'s «Новые записи» feed and in
`/organizer/rides/[id]/participants` is now a link to that rider's card
(`/rides/[id]/riders/[registrationId]`, CR-126). `?from=overview|participants`
(a closed set parsed by `parseRiderProfileOrigin`, never a free-form return URL)
switches the card's back link to «В кабинет организатора» / «К участникам заезда»;
without it the card still goes back «К заезду». Waitlist entries stay plain text —
the card only exists for active registrations.

API (behavior change, additive in effect): `resolveRiderAccess` checked
`participantsVisible` before the organizer grant, so an organizer who hid the
riders list got `403 riders_hidden` on their own participants' cards — every new
link would have been dead on such a ride. The ride's own organizer now skips that
check; everyone else still gets `riders_hidden` first. Recorded as an ADR-023
amendment; `docs/api.md` updated.

Files: `apps/api/src/modules/registrations/registrations.service.ts` (+ test in
`rider-profile.routes.test.ts`), `apps/web/src/lib/rides/rider-profile-href.ts`
(+ test), `features/organizer/activity/{lib/activity.ts,components/
RegistrationActivityWidget.tsx}` (`ActivityEntry.rideId`), `features/organizer/
participants/components/ParticipantTable.tsx`, `app/rides/[id]/riders/
[registrationId]/page.tsx`, `packages/ui/src/terminology.ts` (`BACK_LINK_TERMS`).

Validation: api registrations suites 60/60 (disposable `TEST_DATABASE_URL`),
web 443/443, ui 155/155, typecheck + lint (web/api/ui) green, prettier clean;
dev server renders the right back link for each `from` value (unknown → «К заезду»).

Decisions: ADR-023 amendment 2026-09-28.
Follow-up: none.

## 2026-09-28 — CR-150 — Organizer sidebar lights the right section on ride sub-pages

Summary: the owner reported that opening «Участники» or «Обновления» left «Заезды»
highlighted. Both entries go through `NearestRideRedirect` to
`/organizer/rides/[id]/participants|updates`, and CR-131's prefix rule gave
`/organizer/rides/…` to «Заезды». `CabinetNavItem` gains an optional `activeOn`
(path patterns, `*` = exactly one segment); an item whose pattern matches takes the
highlight outright, otherwise the old exact/prefix rule applies unchanged. Set on
the participants and updates descriptors; the same rule drives the desktop sidebar
and the mobile `CabinetSectionTabs`. Every other ride sub-page (edit, route, cover,
groups) still lights «Заезды».

Files: `apps/web/src/lib/cabinet/types.ts`, `components/cabinet/CabinetSidebar.tsx`
(`isCabinetNavItemActive`, + test), `features/organizer/{participants,updates}/nav.ts`.

Validation: web 444/444, typecheck + lint green.

Decisions: none (additive registry field, ADR-009 pattern).
Follow-up: none.

## 2026-09-28 — CR-146 — Self-hosted web fonts; known-issues sweep

Summary: KI-074 — `next build` downloaded five font families from Google Fonts
and twice failed CI when the response wasn't the expected CSS. All five are now
committed `.woff2` files in `apps/web/src/fonts/` (SIL OFL, licences in
`src/fonts/licenses/`) loaded through `next/font/local`; `app/layout.tsx` keeps
the same CSS variables, weights and `display: 'swap'`.

- Files are generated by `src/fonts/build-fonts.sh` (fontTools, run by hand, never
  part of a build) from google/fonts sources pinned to commit `23e54b5`: static
  instances at the weights used before (Golos Text 400/500/600/800, Unbounded
  500/600/700, Sofia Sans Extra Condensed 700/800, IBM Plex Mono 400/500) and
  Sofia Sans Condensed as a variable font over its whole axis, as Google served it.
  Glyphs: Google's own `latin` + `cyrillic` unicode ranges (read from its CSS), so
  coverage is unchanged — `₽` still falls back as before. Every OpenType feature
  is kept (`locl` for Sofia Sans' Russian forms under `lang="ru"`, `tnum`).
  Compared against the files Google serves Linux Chrome: same hinting (Plex
  hinted, the rest unhinted), same variable/static split. 12 files, ~400 KB.
- Verified: `next build` output has 12 `@font-face` rules pointing at
  `/_next/static/media/*.woff2` plus `next/font`'s metric-adjusted Arial fallbacks,
  and no `googleapis`/`gstatic` reference anywhere; in the dev server a browser
  loads every face locally with zero Google requests; the ride page renders Russian
  Sofia Sans forms. `docs/design.md` §4 updated.
- Known-issues sweep: KI-008, KI-011, KI-017, KI-018, KI-034, KI-035, KI-051
  (already resolved) and KI-074 moved verbatim to `known-issues-archive.md`.
  KI-015 closed: the live S3 round trip it asked for exists since CR-137 and
  passed locally (3/3, `RUN_LIVE_S3_TESTS=1`). KI-026/KI-042 stay open — still
  blocked on `EMAIL_FROM_ADDRESS` (unset) and `unisender.ru` reachability.

Validation: web typecheck + lint green, `next build` green, live checks above.
Visual-regression baselines not re-rendered locally (they must be x86_64); CI's
e2e job is the check — if a screenshot differs only by glyph anti-aliasing, take
its `*-actual.png` from the `playwright-report` artifact per
`.claude/rules/testing.md`.

Decisions: none (KI-074's own planned fix).
Follow-up: none.

## 2026-09-28 — CR-151 — «Постер заезда v2»: the ride page rebuilt

Summary: `/rides/[id]` rebuilt to the owner's «Постер заезда v2» mockup — a dark
hero with the route (track ⇄ 2GIS map), a numbers band, and a perforated
registration «ticket» that carries every registration state.

- **Head**: start line + relative-day chip («через 5 дней», ride time zone), the
  title in Unbounded at poster size, organizer avatar/name/rating.
- **Hero** (`RideHero`, `TrackCover`): the real route geometry on the always-dark
  cover with an elevation silhouette and typed pins, or the live 2GIS `RouteMap`,
  switched by a «Трек / Карта» `SegmentedControl` on the cover. No track → pins
  only (never joined) + «Маршрут пока не загружен». Numbers band: distance,
  elevation, pace (+ group count), duration — always four, missing as «—» (before,
  missing metrics were dropped).
- **Ticket** (`RegistrationTicket`, replaces `RegistrationButton`): open / few seats /
  full (queue size, next queue place) / waitlisted (own queue place) / registered
  (start number, «До старта 5 дн 14 ч», group, meeting point, change group, share,
  cancel) / not open yet / closed / started / finished / cancelled. Same API calls,
  confirm dialogs, toasts and sign-in redirect as before. Sticky aside from `lg`,
  under the hero on a phone; the phone bar (`TicketBar`) appears only after the
  ticket scrolls away and scrolls back to it instead of acting itself.
- **Main**: chips + description; «Маршрут по точкам» (`RouteTimeline`, replaces
  «Условные знаки»: km along the track, start time, «≈» finish time); the elevation
  profile redrawn in real pixels with axes, whose pointer moves a dot along the
  cover's track; GPX + «Поделиться» (Web Share, clipboard fallback); «Кто едет»
  (initials avatar stack, group split, the grouped list behind «Весь список
  участников»).
- **API (additive)**: `GET /v1/rides/:id` gains `waitlistCount`,
  `viewerStartNumber` and `viewerWaitlistPosition` — ranks by `(createdAt, id)`,
  the listing/FIFO-promotion order; the viewer's row is referenced by id inside
  SQL so microsecond timestamps can't miscount a tie. `docs/api.md` updated.
- **`packages/ui` (additive)**: `SegmentedControl` (native radios in a `fieldset`,
  sliding thumb; the radio covers its whole segment, so a click — or Playwright's
  `check()` — lands on it), `MetricTile.valueClassName`, `RIDE_POSTER_TERMS`,
  `RIDE_TICKET_TERMS`, `formatRelativeDay`, `formatCountdownShort`. Only the ride
  page uses them; no existing prop changed.
- Behaviour changes, deliberate: a registered viewer can no longer cancel from
  the page once the ride has started or finished; a cancelled ride shows the
  cancelled ticket even to a viewer whose registration row is still active.
- Maps render contract (additive, same precedent as CR-107/118): optional
  `MapRenderOptions.zoomControlPosition` (`maps-core`, passed to MapGL's
  `zoomControl` by `maps-2gis`); the hero's map puts the zoom buttons
  centre-right so they clear the «Трек / Карта» switch. `.claude/rules/maps.md`
  updated.
- Removed: `RegistrationButton`, `RouteLegend`, `GroupPicker`, `StartCountdown`,
  `buildElevationProfile` (superseded by `lib/route-track.ts`).
- Mockup items not built: the cancellation reason (no model field — the banner
  says only that the organizer cancelled; a reason field would be its own
  ticket); the map face's scrub dot (drawn on the track face only).

Validation: api 118/118 in the touched suites (new start-number/queue-place test)
and 488/490 full (2 skipped) against the compose Postgres/Redis/S3 with the live
flags; web 460/460 (ride-detail 74, incl. new lib tests for `route-track`,
`timeline`, `ticket-state`); ui 170/170 (`SegmentedControl`, formatters, poster
terms). typecheck/eslint/prettier clean (web, ui, api, types). e2e (chromium,
native): pace-groups, registration-waitlist, critical-journeys, ride-lifecycle,
login-return, gpx-route, route-points-stops, profile-visibility, access-control,
notifications — 19/19 (pace-groups updated: «Группа по темпу» legend, the
ticket's group cell). Live check on the dev server (seeded ride with a route and
two groups): desktop 1440 and a 390px phone; the phone bar hidden at the top,
shown after scrolling, its button scrolls back to the ticket. `coverage:check`
green, baseline raised (ui branches +1.75 pp, web +1 pp). Visual baselines for
`ride-detail` NOT regenerated — the `linux/amd64` Playwright image won't pull
here (KI-076); CI's screenshot check for that page will fail until they're
replaced from its artifact.

Decisions: cancellation reason not added (no model field; mockup allowed dropping
the line). No new ADR — additive API fields and one additive `packages/ui`
component.
Follow-up: KI-076 (baselines); a cancellation reason, if wanted, is its own ticket.

## 2026-09-28 — CR-151 follow-up — Map zoom buttons clear of the hero's view switch

What: on `/rides/[id]`'s «Карта» face, 2GIS's default top-right zoom control sat
under the hero's «Трек/Карта» switch (owner's screenshot). `MapRenderOptions` gains
an optional `zoomControlPosition` (`packages/maps-core/src/render.ts`), mapped to
MapGL's `zoomControl` in `packages/maps-2gis/src/render.ts`; `RouteMap.tsx` passes
`'centerRight'`. Discovery/route-builder maps keep the default corner.

Why: an overlay the page owns must not be covered by a provider control; putting
the position on the render contract keeps the fix provider-neutral (ADR-010/020),
additive — no new ADR. `.claude/rules/maps.md`'s contract updated.

Validation: maps-2gis `render.test.ts` 19/19 (two new cases: position forwarded,
omitted → no `zoomControl`); typecheck/eslint clean (maps-core, maps-2gis, web);
prettier clean. Not checked live with a MapGL key in this run.

## 2026-09-28 — CI fix — `users/avatar.routes.test.ts` cleanup order

What: the suite's `beforeAll`/`afterAll` ran `DELETE FROM users` without
`DELETE FROM rides` first — the only API suite that did. When an earlier file
left rides behind (`rider-profile.routes.test.ts` has no `afterAll`), the
`rides.organizer_id` FK blocked the cascade and all 14 tests failed on setup.
Vitest's file order follows cached durations, so this surfaced only after
CR-149 changed the order — CI failed on CR-146 and CR-151 for this reason,
before the e2e job could produce the screenshots KI-076 needs.

Fix: delete rides first, like every other suite. Reproduced locally
(rider-profile → avatar: 14/14 failed before, 14/14 pass after); full API
suite 485 passed / 5 skipped with the live S3/Redis flags.

## 2026-09-28 — KI-076 — Visual baselines refreshed; seeded cover art hidden from snapshots

What: with the API cleanup flake fixed, CI's e2e failed on seven screenshots, not
just the two KI-076 expected. Two causes: CR-146's self-hosted fonts (every glyph
shifted — first e2e run since that change) and the cover isolines, which
`RouteCover`/`TrackCover` pick/generate from the ride's id — a random UUID per
run, so the card, grid and ride-detail shots never matched, even between retries.

Fix: both isoline groups carry `data-isolines`; `visual-regression.spec.ts`
hides them via `toHaveScreenshot`'s `stylePath` (`e2e/hide-seeded-art.css`) —
the track, labels and layout are still compared. Baselines replaced from CI
runs `36413572568` (organizer-dashboard, discovery-map — mobile) and
`36415279536` (ride-detail ×2, ride-card ×2, discovery-grid mobile): each
identical across all three attempts (≤11 px of edge anti-aliasing), checked by
eye — only the CR-151 layout and the new fonts, no layout breakage.
KI-076 archived.
