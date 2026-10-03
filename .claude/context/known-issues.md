# Known Issues

Blockers, unresolved bugs, external integration limitations, and technical debt that must
survive between Claude Code sessions.

Each issue: ID; status; discovered date; problem; impact; workaround; next action.

## Archiving (keep this file cheap to read)

This file tracks active risk. Once an issue is resolved, move its entry verbatim into
`.claude/context/known-issues-archive.md` (preserving content exactly, same discipline as
`docs/changelog.md`'s own archive) instead of leaving it here under a growing "Resolved"
section — the resolution's _why_ belongs in `docs/changelog.md`'s CR entry anyway. Do this
as part of closing the issue, not as a periodic batch cleanup.

---

## Open

### KI-021 — `RideService`/registration-state keys in the terminology module are provisional

Status: open. Discovered: 2026-09-13 (CR-064).
Problem: `docs/design.md` §13 lists the Russian labels for 10 services and 4 registration
action/state strings, but `docs/product.md` §Services only names the services in free-text
English (`food, water, coffee, support vehicle, mechanic, medical support, transfer,
bicycle transport, parking, changing room/shower`), not as enum keys — no `RideService` DB
enum exists yet (`packages/db` has zero domain tables), and no `Registration` status enum
exists either. `packages/ui/src/terminology.ts`'s `RIDE_SERVICE_TERMS`/
`REGISTRATION_ACTION_TERMS` therefore had to mint snake_case keys (`support_vehicle`,
`medical_support`, `bicycle_transport`, `changing_room`; `register`/`cancel`/`waitlisted`/
`full`) rather than reuse an authoritative source.
Impact: low today (nothing consumes these keys yet). Real risk: whichever CR defines the
actual `RideService` DB enum (routes/stops/services work, not yet scheduled with a CR
number in `docs/tasks.md`) could pick different key spellings, silently breaking this
lookup table (a missing key renders as `undefined`, not a caught error, unless the
consumer guards it).
Workaround: none needed yet — no consumer.
Next action: when the `RideService` DB enum (and any `Registration` status enum) is
defined, either match these exact keys or update `terminology.ts` to match — do not let
the two drift apart silently. Ride status (`draft`/`published`/`registration_open`/
`registration_closed`/`started`/`finished`/`cancelled`) and bicycle type
(`road`/`gravel`/`mtb`/`any`) are NOT affected — both already have an authoritative source
in `docs/product.md`.
Update 2026-10-01 (CR-164, re-verified against the code): still open, and the
registration half is now half-answered. A `registration_status` pgEnum _does_
exist (`packages/db/src/schema/registration.ts`: `active`/`cancelled`), but it
does not collide with `REGISTRATION_ACTION_TERMS`' keys — those are
call-to-action/state _labels_ (`register`/`cancel`/`waitlisted`/`full`/
`joinWaitlist`/`leaveWaitlist`), a different axis from a persisted status, so
there is nothing to reconcile there and the `terminology.ts` doc comment saying
"no `Registration` status enum exists yet either" is now simply out of date.
The `RideServiceKey` half is unchanged and is the real remaining risk: there is
still no `ride-service.ts` schema file and no `ride_service` pgEnum anywhere in
`packages/db`, and the snake_case keys (`support_vehicle`, `medical_support`,
`bicycle_transport`, `changing_room`) still appear nowhere outside
`packages/ui/src/terminology.ts` — no DB, API or `packages/types` consumer.
Next action unchanged for that half.

### KI-026 — No verify-email web screen exists, and two organizer actions now hard-depend on it

Status: narrowed 2026-09-20 (CR-099). Discovered: 2026-09-13 (CR-011, as an accepted scope boundary —
"not a clickable page ... but enough for the live-check/manual QA path via a
direct POST"). Widened: 2026-09-14 (CR-019) — a second organizer action now
gates on the same unreachable-from-the-UI state.
Problem: `docs/design.md` §8 lists `/verify-email` under "Auth flows" with a
note pointing at CR-059/CR-060, but CR-059's UI half was never built — only
`POST /v1/auth/verify-email` (the API call a real screen would make) exists.
An organizer with an unverified email today has no in-app way to complete
verification at all. `POST /v1/organizers/me` (CR-014) already 403s
`email_verification_required` for such a caller; CR-019 (this session) adds
`POST /v1/rides/:id/publish` as a second endpoint with the identical gate —
both now show a correct, worded banner in `apps/web`, but neither can link
anywhere that actually resolves the problem.
Impact: medium and growing — a real organizer who registers, skips the dev-
only `verificationUrl` response field (production never returns it; real
email delivery is ADR-007, still Pending), and later tries to create an
organizer profile or publish a ride hits a dead end with no recovery path in
the UI.
Workaround: manual — call `POST /v1/auth/verify-email` directly (curl/API
client) with the token from `POST /v1/auth/register`'s dev-only
`verificationUrl` field, same as this session's and CR-011's own live checks
already do.
Next action: CR-059's own remaining scope was narrowed to "gate organizer
publish" and is now closed by CR-019 — the actual `/verify-email` screen has
no ticket number of its own in `docs/tasks.md`. Needs one added (same
"real gap, add a ticket" discipline as KI-024/KI-025) before or alongside
ADR-007's real email delivery, since a screen with no email pointing at it is
only marginally more useful than today's curl workaround.
Update 2026-09-20 (CR-099, a user-run QA pass against a live browser): the
real `/verify-email` page now exists (`app/verify-email/page.tsx` +
`features/auth/verify-email`), reads `?token=` and calls `POST /v1/auth/
verify-email` on mount. The register success screen's dev-only note was
itself misleading before this — it rendered the raw API path
(`/v1/auth/verify-email?token=...`, a POST-only route) as if it were a
clickable link, which 404'd when followed; it now links to the real
`/verify-email?token=...` web page instead. Live-verified end to end in a
real browser against the real running stack: register → click the rendered
link → "Email подтверждён". This closes the dev/QA-path half of this issue.
Still narrowed, not fully resolved: in production, `verificationUrl` is
never returned (ADR-007's real email delivery is still Pending), so a real
organizer still has no way to ever reach this screen with a valid token —
the screen existing doesn't by itself close that half. Next action unchanged
until ADR-007 lands.
Update 2026-09-20 (CR-100, ADR-007 now Accepted): real email delivery now
exists — `POST /v1/auth/register` sends (or enqueues) a verification email
via Unisender Go alongside the unchanged dev-only `verificationUrl` field.
Still not fully resolved, for two independent reasons: (1) the user hasn't
yet configured `EMAIL_FROM_ADDRESS` (no sender is verified in their
Unisender Go account) — until then `app.emailProvider` stays `null` and the
producer silently no-ops, unchanged from before this session; (2)
`unisender.ru`/`go1.unisender.ru` fail DNS resolution (`SERVFAIL`) from
inside this sandbox specifically (confirmed via `nslookup` — not a blanket
`.ru` block, `ya.ru` resolves fine) — a real send has never actually been
exercised live, only against mocked `fetch` in `unisender-provider.test.ts`.
Next action: user sets `EMAIL_FROM_ADDRESS` to a real verified sender, then
the first session with real network access to `unisender.ru` should send
one real email end to end (register → check inbox → click link) before
this is trusted as more than "the adapter's request shape is correct."
Update 2026-10-01 (CR-168): a second, independent gap was found here that
every prior update had missed — and it was code-side, not config-side.
`POST /v1/auth/register` issued the **only** verification token a user would
ever get; no resend endpoint existed anywhere in the repo (confirmed by
`grep -rni resend` over `apps/api/src`, `apps/web/src`, `packages/ui/src`,
`docs/api.md` — the single hit was `notifications.service.ts`'s own comment
naming the gap: "there is no resend endpoint, so a dropped email would leave
the account unverifiable"). So even with `EMAIL_FROM_ADDRESS` configured and
delivery working, a 24h token expiry, a spam-filtered email, or a closed tab
left the account permanently unverifiable — `/register` answers `409
email_already_registered`, so re-registering was not a way out, and both
`POST /v1/organizers/me` and `POST /v1/rides/:id/publish` stay 403 forever.
The UI copy had been promising a resend that did not exist
(`VERIFY_EMAIL_TERMS.invalidOrExpired`: «Запросите новую при следующем
входе» — nothing at login did this; `ORGANIZER_TERMS.
emailVerificationRequired`: «Ссылка ... была отправлена при регистрации» —
a statement, not an action). CR-168 adds `POST /v1/auth/resend-verification`
(session-authenticated, bodyless, sweeps outstanding tokens, rate-limited on
both tiers) and surfaces it as `ResendVerificationButton` on all three
dead-end surfaces (`/verify-email`'s error states, `/organizer/profile`'s
banner, ride-edit's publish banner), with the two misleading strings fixed.
Live-verified in a real browser against the running stack: register → log in
unverified → open a stale `/verify-email?token=` link → «Отправить письмо
повторно» → «Письмо отправлено…», and the same button on the organizer
profile's 403 banner; separately verified over HTTP that a resend
invalidates the previous link (`verification_token_already_used`) and that a
resend-issued token verifies the account (`emailVerified: true`).
Next action: unchanged and now the only remaining half — user sets
`EMAIL_FROM_ADDRESS` to a verified sender and one real send is exercised
from a network that can resolve `unisender.ru` (KI-055). Until then the
resend button issues a valid token and the producer no-ops, exactly as
`register`'s has since CR-100.

### KI-038 — `next build` crashes if a `development`-valued `NODE_ENV` reaches it from the shell

Status: open (documented workaround, no code fix needed). Discovered: 2026-09-15
(CR-036, "Waitlist" session, while running the full `turbo run ... build` validation
pass).
Problem: this project's root `.env` sets `NODE_ENV=development` (needed for
`apps/api`'s dev server / `packages/db` migrations to run in dev mode). Sourcing that
file into the shell (`set -a && source .env && set +a`, the pattern this and prior
sessions use to get `DATABASE_URL`/etc. into `pnpm`/`turbo` commands) and then running
`next build` in the same shell makes `apps/web`'s production build crash during static
export: `Error: <Html> should not be imported outside of pages/_document`, on both
`/404` and `/_error`. Confirmed via `git stash` that this reproduces identically
against `main` at the last commit before this session's changes — a pre-existing
environment/tooling interaction, not a regression this or any other CR introduced.
Root cause: Next.js only forces `NODE_ENV=production` for `next build` when the
variable isn't already set; an explicitly inherited `development` value survives and
changes internal prerendering behavior for the auto-generated `/404`/`/_error` pages
(the pages-router-style error/document code path), which the app-router-only, no
`pages/` directory setup in `apps/web` doesn't otherwise exercise. Not caused by a
stale `.next`/`.turbo`/`node_modules/.cache` — clearing all three and retrying still
failed under an inherited `NODE_ENV=development`; passed immediately once `NODE_ENV`
was overridden to `production` for that one command.
Impact: medium — any session that sources the root `.env` for other reasons (DB
migrations, `apps/api` env vars) and then runs `turbo run build` or `pnpm --filter web
build` in the _same_ shell will see a spurious `web:build` failure that looks
code-related but isn't.
Workaround: run `apps/web`'s build with `NODE_ENV=production` explicitly overriding
whatever the shell inherited, e.g. `NODE_ENV=production pnpm --filter web build`, or
export the other needed variables (`DATABASE_URL` etc.) individually instead of
sourcing the whole `.env` file before a build. `turbo run build` alone (without first
sourcing `.env` into the same shell) does not hit this either, since nothing sets
`NODE_ENV` for it in that case.
Next action: none required — this is a shell/invocation-order gotcha, not a bug in
`apps/web`'s own code or config. Worth remembering for any future session's validation
pass: don't reuse a `source .env`'d shell for both `apps/api` DB work and `apps/web`
builds without overriding `NODE_ENV` for the latter.

### KI-042 — No `/forgot-password`/`/reset-password` web screens; the reset token is never exposed over HTTP, even in dev

Status: narrowed 2026-09-20 (CR-099). Discovered: 2026-09-17 (CR-060, "Password reset flow").
Problem: `docs/design.md`'s Auth-flows row names `/forgot-password`/
`/reset-password` but no CR before this one built either the API or the
screens — same gap shape as KI-026 (`/verify-email`). CR-060 shipped the API
mechanics only (`POST /v1/auth/forgot-password`, `POST
/v1/auth/reset-password`). Unlike `/verify-email` (whose `register` response
carries a dev-only `verificationUrl`), this endpoint's response must stay
byte-identical whether or not the email exists
(`.claude/rules/security.md` — no account enumeration), so no dev-only token
field exists anywhere on `forgot-password`, in any environment. A real
organizer/participant who forgets their password today has no way to
actually complete a reset without a real email-delivery channel (ADR-007,
still Pending).
Impact: medium — password reset is unusable end to end for a real user in
this environment (no email delivery, no web screen), though the underlying
mechanics (issue/validate/consume token, revoke sessions) are fully built and
tested.
Workaround: manual/test-only — call `requestPasswordReset(db, email)`
directly from the service layer (as `auth.routes.test.ts` does) to obtain
the raw token, then `POST /v1/auth/reset-password` with it via curl/API
client. No production-safe workaround exists, by design.
Next action: needs its own ticket (same "real gap, add a ticket" discipline
as KI-024/KI-025/KI-026) for the `/forgot-password`/`/reset-password` web
screens, and depends on ADR-007's real email delivery landing before a real
user could ever discover their own reset token — a web screen alone doesn't
close this gap without a delivery channel behind it.
Update 2026-09-20 (CR-099, a user-run QA pass against a live browser): both
`/forgot-password` and `/reset-password` screens now exist (`app/
forgot-password/page.tsx`, `app/reset-password/page.tsx` +
`features/auth/{forgot-password,reset-password}`). Live-verified
`/forgot-password` end to end against the real running stack (generic
success state shown regardless of account existence, per
`.claude/rules/security.md`); `/reset-password`'s missing-token state
live-verified, its token-present path covered by
`reset-password.test.tsx` against the same three server error codes
(`invalid_reset_token`/`reset_token_already_used`/`reset_token_expired`)
`auth.routes.test.ts` already exercises server-side (no dev-only token
field exists to fetch one through a real browser — by design, unchanged).
Still narrowed, not fully resolved: this closes the "no screens" half only
— "the reset token is never exposed over HTTP, even in dev" is unchanged
and deliberately so, and a real user still cannot discover their own token
without ADR-007's real email delivery landing. Next action unchanged.
Update 2026-09-20 (CR-100, ADR-007 now Accepted): `POST /v1/auth/
forgot-password` now sends (or enqueues) a real reset email via Unisender
Go when the account exists — the route's response stays byte-identical
`204` either way, so this adds no enumeration surface. Same two open
reasons as KI-026's identical update: no `EMAIL_FROM_ADDRESS` configured
yet (`app.emailProvider` stays `null`, producer no-ops), and this sandbox
can't resolve `unisender.ru` (`nslookup` confirms `SERVFAIL`) to exercise a
real send. Next action: same as KI-026's — configure a verified sender,
then verify one real send from an environment with real network access.
Update 2026-10-01 (CR-168): checked against KI-026's newly-found resend gap
and this issue does not share it. Password reset is already self-service
end to end: `/forgot-password` can be requested again at any time, by anyone,
with no token or prior state needed, and each request issues a fresh token —
there is no equivalent of "the one token you'll ever get." The only thing
standing between a real user and a completed reset here is delivery, which is
the `EMAIL_FROM_ADDRESS`/KI-055 half above. Deliberately not given a resend
button: `/forgot-password` _is_ the resend, and adding a second
session-authenticated path would be meaningless (a user who can log in does
not need a password reset). Next action unchanged.

### KI-045 — CR-075/CR-076's Caddy/compose production manifest has never been run end to end

Status: open. Discovered: 2026-09-17 (CR-075, ADR-018; extended CR-076).
Problem: same root cause as KI-019/KI-043 — Docker's daemon is unreachable in this
environment. `docker-compose.prod.yml`, `deploy/Caddyfile`, and (CR-076)
`packages/db/Dockerfile` + the `migrate` service have not had an actual `docker
build`/`docker compose up`/`docker compose run` executed against them, and Caddy's
automatic ACME/TLS additionally needs a real public DNS record pointing at a real
host — something no local or CI sandbox could ever satisfy, Docker daemon or not.
Impact: medium — the compose file's structure (services, env interpolation,
volumes, no published ports on `web`/`api`, the `migrate` profile correctly
absent from a profile-less `docker compose config --services`) was validated with
`docker compose -f docker-compose.prod.yml config`, which catches YAML/
interpolation mistakes but not runtime behavior (container startup order actually
working, Caddy successfully obtaining a certificate, `web` actually reaching `api`
by service name, the `migrate` image actually building). `deploy/Caddyfile` itself
was only reviewed by hand against Caddy's documented syntax — no `caddy validate`
was run (no local `caddy` binary either). CR-076's `packages/db/Dockerfile` got an
extra layer of confidence beyond that: its exact planned file set (workspace
`package.json`s + `packages/db/src` + `packages/db/migrations`, nothing else) was
reproduced by hand in a plain directory (no Docker) and `pnpm --filter db
db:migrate` was run from it against a real throwaway database, successfully — the
closest a real `docker build` can be approximated without one.
Workaround: none needed pre-deploy — this is inherent to the environment, not a
defect to work around.
Next action: the first actual deployment (a real host, real DNS pointed at it)
should run `docker compose -f docker-compose.prod.yml up -d --build`, confirm all
three long-running containers report running/healthy, confirm Caddy actually
obtains a certificate (check its logs, not just that the container started),
confirm `https://$DOMAIN` serves `apps/web` with `/api/v1/*` correctly reaching
`apps/api` end to end, and separately run `docker compose -f docker-compose.
prod.yml --profile migrate run --rm migrate` to confirm the migration image
actually builds and applies cleanly — before trusting this manifest as more than
"the YAML parses."
Update 2026-09-26 (CR-134): everything except Caddy now runs end to end in
`deploy/smoke/run.sh` (CI job `docker-smoke`) — `migrate` builds and applies,
`api` starts with no published port, `web` reaches `api` by service name.
Still unverified: Caddy (config, ACME/TLS, Caddy → web hop) and the `backup`
service — both need a real host.
Update 2026-09-28 (CR-145): `deploy/Caddyfile` passes `caddy validate` (official
v2.11.4 binary, same 2.x line as `caddy:2-alpine`; Docker Hub layers can't be
pulled from this machine) and adapts to the expected single `reverse_proxy web:3000`
route on :443. Caddy's X-Forwarded-For handling — the Caddy → web hop's one
observable effect on `api` — was probed and relied on for KI-044. Still
unverified: ACME/TLS and the `backup` service, both need a real host.

### KI-055 — `unisender.ru` (all subdomains) fails DNS resolution from this sandbox

Status: open. Discovered: 2026-09-20 (CR-100, ADR-007 session).
Problem: `nslookup go1.unisender.ru`/`go2.unisender.ru` both return
`SERVFAIL` from this sandbox's resolver — not a blanket `.ru` TLD block
(`nslookup ya.ru` resolves normally to real addresses), specific to this
one vendor's domain. `WebFetch` against `godocs.unisender.ru` (API docs)
failed identically (`ENOTFOUND`) earlier the same session, before any code
existed to blame — confirming this is a standing environment/network
constraint, not a bug in `lib/email/unisender-provider.ts`.
Impact: medium — blocks live end-to-end verification of the real Unisender
Go integration (CR-100) in this specific sandbox. Zero impact on
correctness confidence otherwise: the adapter's request shape was verified
against the real `django-anymail` Unisender Go backend source (not
guessed), and `unisender-provider.test.ts` exercises its parsing/error-
normalization logic against mocked `fetch` responses matching that verified
shape.
Workaround: none needed for development — the adapter degrades identically
whether Unisender is unconfigured (`app.emailProvider === null`) or
configured-but-unreachable-from-here; either way every producer no-ops
without throwing (`.claude/rules/resilience.md`).
Next action: the first session with real network access to `unisender.ru`
(the user's own machine, CI, or production) should send one real
verification/reset email end to end (register or forgot-password → check a
real inbox → click the link) once `EMAIL_FROM_ADDRESS` is configured to a
sender verified in the Unisender Go account — see KI-026/KI-042's matching
"Next action."
Update 2026-10-01: still `SERVFAIL` from this machine (resolver `10.12.0.1`,
VPN), and `.env`'s `EMAIL_FROM_ADDRESS` is still empty — both on the owner's
side; KI-026/KI-042's remaining halves wait on them.

### KI-056 — 2GIS REST APIs (Routing/Geocoder) unreachable from this machine's current egress

Status: open. Discovered: 2026-09-23 (while seeding a dev route after CR-112).
Problem: `routing.api.2gis.com`/`catalog.api.2gis.com` resolve (to
`91.236.49.x`) but every TCP connect to :443 times out, sandbox on or off.
MapGL tiles/JS (`mapgl.2gis.com`, a different subnet) load fine, so maps
render but nothing server-side can call 2GIS. Egress country reported as
`FR` — the machine is routed through a VPN; 2GIS's API edge appears not to
accept that path.
Impact: high for any route-building work — `MapProvider.getRoute`/`geocode`
cannot be exercised live. A dev route seeded as a stand-in was built from
OSM (OSRM bike profile), not 2GIS; an earlier version of that seed thinned
the line to one point per 120 m and visibly cut across the Moskva river —
fixed by re-seeding at full resolution, but it's still OSM data, not 2GIS.
Workaround: turn the VPN off (or split-tunnel `*.2gis.com`) before any
session that needs the 2GIS REST APIs.
Next action: with 2GIS reachable, rebuild the "Тестовый заезд на выходные"
seed route through `create2GisMapProvider().getRoute({ profile: 'cycling' })`.
Update 2026-09-23 (CR-114): the route builder is implemented against mocked
2GIS responses only. Also verify live: that `need_altitudes: true` yields a Z
coordinate in `outcoming_path.geometry[].selection` (otherwise built routes have
no elevation profile), and what 2GIS returns for an unroutable pair of points
(the adapter maps 204 / empty result / no geometry to `no_route` → 422).
Update 2026-09-28 (CR-114 verification attempt): still unreachable — Routing/
Geocoder time out, egress `FR`. `provider.contract.test.ts` gained the
unroutable-pair case (Moscow → Reykjavik must fail as `no_route`), so a single
live run answers both open questions. The other way to run it, the
`maps-contract.yml` workflow on GitHub's runners, has never run: the
`maps-2gis-contract` environment and its `MAPS_2GIS_API_KEY` secret don't exist,
so its weekly schedule is silently skipped too.
Update 2026-09-28 (CR-147): environment + secret created; first live run
(`36386689239`) on GitHub's runners — 2GIS REST is reachable from there, so
the VPN no longer blocks verification. geocode/reverseGeocode pass. Found and
fixed: altitudes arrive in centimetres (15820 for Moscow; built routes would
have had ×100 elevation gain), and the Catalog API's HTTP-200 `meta.code`
errors (an invalid key read as "nothing found"). Still open: Moscow →
Reykjavik answers HTTP 403 → `unavailable`, not `no_route`; a diagnostic in
the contract test prints the raw answer on the next run.
Update 2026-09-28 (CR-147, later): the 403 was the demo key's 50 km limit
between points (KI-075), not coverage. An island with no bridge (Rabocheostrovsk
→ Solovki) answers HTTP 200 `{type:'error', status:'ROUTE_DOES_NOT_EXISTS'}`,
now mapped to `no_route`. Run `36387478533` on `0d8d57c`: 5/5 green — both
CR-114 questions answered. Also seen: bicycle routing takes ferries
(Vladivostok → Popova island returned a route with `filter_road_types:
["dirt_road","ferry"]`). What stays open here is only local reachability:
the seed route rebuild still needs this machine to reach 2GIS (VPN off or
split-tunnel `*.2gis.com`); live adapter checks go through `maps-contract.yml`.
Update 2026-09-29 (CR-148/CR-160): this machine could reach 2GIS again this
session (TCP connect + a real geocode call both succeeded; egress path/VPN
state not otherwise diagnosed — no action taken here, it was simply
reachable). Used the window to run `pnpm seed:demo` without `--no-routes`
for the first time: found and fixed a real, separate route-builder bug
(CR-160, `packages/maps-2gis/src/route.ts`) — every point was sent as
`type: 'stop'`, but 2GIS only honors a `stop` at the first/last position and
silently drops one in the middle, so a closed-loop ride (shared start/end
point) collapsed to a near-zero-length route instead of touring all
waypoints. Fixed by sending `type: 'pref'` for intermediate points; live-
verified against the real API (7-point loop went from 51 m to a correct
22.4 km) and against all 9 seed rides end to end (`pnpm seed:demo` fully
green, routes built on real roads, e.g. 1014-point dense polyline with real
elevation for "Кофейный круг"). CR-148 is now fully done — no more
`--no-routes` fallback needed when 2GIS is reachable. This entry stays open
only for the reachability question itself: still no split-tunnel/VPN-off
procedure has been established as a standing fix, so a future session may
still find 2GIS unreachable again.

### KI-057 — The 2GIS basemap stays light in the dark theme

Status: open. Discovered: 2026-09-23 (CR-118/CR-119 review).
Problem: the «Топокарта» dark theme (ADR-021) re-colours every app surface, but
both MapGL maps (`DiscoveryMap`, `RouteMap`, `RouteBuilder`) keep 2GIS's default
light basemap style. Marker halos and the route casing resolve from the dark
theme's tokens (`--route-casing`), so on the light tiles they read as dark
outlines instead of the intended "paper" halo.
Impact: low-medium — cosmetic, nothing breaks, but the largest surface on
discovery and ride detail ignores the theme.
Workaround: none needed; the maps stay legible.
Next action: pick a 2GIS MapGL dark style (style id from the 2GIS account's
style editor), pass it through `MapRenderOptions` as an additive provider-neutral
option (e.g. a `theme: 'light' | 'dark'`, mapped to a style id inside
`packages/maps-2gis`), switch it when the theme changes, and re-check the halo
colours on both basemaps. Next task after KI-064.

### KI-075 — The 2GIS key is a demo key: routing refuses points over 50 km apart

Status: open. Discovered: 2026-09-28 (CR-147, contract run `36387194155`).
Problem: `MAPS_2GIS_API_KEY` (in `.env` and the `maps-2gis-contract` GitHub
environment) is a demo key. Routing answers HTTP 403 `"excessive distance
between points for demo-keys, max (km): 50"` for points further apart. The
adapter maps any 403 to `unavailable`, so the route builder answers 503 "route
builder unavailable" — not a clear "points too far apart".
Impact: high before launch — a gravel/brevet ride whose waypoints are over
50 km apart can't be built; demo keys likely have other quota/licence limits.
Fine for development and the contract test (its pairs stay under 50 km).
Workaround: place waypoints closer than 50 km.
Next action: owner obtains a commercial 2GIS key (Routing + Geocoder) and
replaces the secret in both places; then check the commercial limit and
whether the 403 case still needs its own error code.

### KI-082 — The basemap watch probes an undocumented 2GIS tile host

Status: open — fix ready (CR-188), awaiting the next CI run. Discovered: 2026-10-02 (CR-185).
CR-188: the six baselines were replaced with the `*-actual.png` files of CI run
37022093199 (bdd20b6 = CR-185's screens), each checked against its `*-diff.png` — only
the intended CR-185 changes (no featured card without a route, the compact no-route grid
card, live/upcoming rides above the dashboard KPIs; «ride card» now captures the grid
card itself, which `a[href^="/rides/"]` matches first once the featured card's button is
gone). CR-186/187/188 change none of these screens. Close once CI's e2e step is green.
Problem: MapGL reports nothing when its tile servers are unreachable, so
`packages/maps-2gis/src/basemap-watch.ts` probes `TILE_PROBE_URL`
(`https://tile0-sdk.maps.2gis.com/`) with a `no-cors` fetch. The host is a 2GIS
implementation detail, not a documented API. A probe failure shows «Карта
недоступна» even if MapGL itself could still have drawn tiles from another host.
Impact: low — a moved host would show the notice on a working map (the list,
filters and pins still work, «Повторить» re-checks). A network that blocks only the
probe host is the same case.
Workaround: none needed; the weekly `maps-contract.yml` job asserts the host still
answers, so a move shows up there before users see it.
Next action: if 2GIS ever exposes a load/error signal for blocked tiles, drop the
probe for it; otherwise keep the contract check. `apps/web` sends no CSP today; a
future `connect-src` must allow the probe host, or every map shows the notice.

### KI-084 — CR-185's visual baselines are not regenerated; CI's screenshot specs will fail

Status: open. Discovered: 2026-10-02 (CR-185).
Problem: CR-185 changes what the seeded screens show — the seeded ride has no route, so
discovery has no featured card and the grid card gets the compact no-route head; the
organizer dashboard puts live rides above the KPI row. Expected to differ:
`discovery-grid`, `ride-card`, `organizer-dashboard` (chromium + mobile) and
`themes.spec.ts`'s discovery light/dark; `discovery-map`/`ride-detail` unverified.
Regenerating needs an x86_64 render (`.claude/rules/testing.md`); the
`mcr.microsoft.com/playwright:v1.63.0-jammy` amd64 image would not download here
(layers kept failing and retrying for ~40 min; only the arm64 one is cached, which the
rules forbid for baselines). A native macOS run proves nothing — it has no `darwin`
baselines and only writes new ones (deleted, never commit them).
Impact: the `ci` job's e2e step fails on these screenshots until fixed; no user impact.
Workaround: none locally.
Next action: after the commit is pushed, take the `*-actual.png` files from the failed
run's `playwright-report` artifact (`gh run download <run> -n playwright-report`),
check each `*-diff.png` shows only the intended CR-185 changes, copy them over the
`*-linux.png` baselines and push. Or retry the amd64 image when the network allows,
with CR-138's procedure: repo copied into the container (not bind-mounted), the
container on the compose network, CI's env with an empty MapGL key,
`--update-snapshots`, then a verify run without it.

Update 2026-10-03 (CR-189..CR-194): CR-188 replaced the six baselines from CI's
artifact, but `fix/qa-13653ed` changes the seeded screens again (CR-193's catalog seats
rule/archive section, CR-190's ride page, CR-189/192's workspace). The amd64 image pull
was retried once more (≈15 min: 2 of 7 layers, then a retry loop) and stopped. Next
action unchanged: push, then the CI-artifact path with every `*-diff.png` checked.

### KI-086 — On a ride's participants/updates tab the sidebar lights «Участники»/«Обновления», not «Заезды»

Status: open. Discovered: 2026-10-02 (CR-187, split out of KI-085 by CR-188).
Problem: deliberate since CR-150 — `features/organizer/participants/nav.ts` and
`updates/nav.ts` carry `activeOn: ['/organizer/rides/*/participants']` /
`['/organizer/rides/*/updates']`, because the cabinet's own «Участники»/«Обновления»
redirect to a ride's sub-page. Inside CR-187's ride workspace those two tabs therefore
light a different sidebar item than the other four tabs, which light «Заезды».
Impact: low — a nav highlight; the workspace's own tabs show the right place.
Workaround: none needed.
Next action: owner decision — keep CR-150's rule, or light «Заезды» on every ride tab
(drop the two `activeOn` entries; `CabinetSidebar.test.tsx` pins the current rule).

## Resolved

Moved to `.claude/context/known-issues-archive.md` (37 entries) on 2026-09-20, per this
file's own Archiving rule — this section had grown to ~1050 lines of closed issues.
