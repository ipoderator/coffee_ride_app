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

Update 2026-10-05 (CR-210): `deploy/FIRST-DEPLOY.md` is now the checklist
for the run this issue is waiting for. It separates what CI's `docker-smoke`
job already proves (images build, migrations apply, `api` publishes no host
port, `web` reaches `api` by service name, the rate limiter sees real client
addresses) from the four things no sandbox or CI run could ever have covered
— Caddy's config at runtime, ACME/TLS issuance, the Caddy → web hop, and the
`backup` service — and gives each a pass criterion. It also flags two traps
worth naming before the first attempt: verify DNS resolves from somewhere
other than the host before starting Caddy (a failed ACME challenge is
rate-limited at Let's Encrypt, and retrying makes the next hour worse), and
`curl -sI https://<DOMAIN>/` must be run without `-k`, which would hide
exactly what the step checks. A backup that has never been restored is not
treated as a backup. Next action unchanged — a real host, with this file as
the procedure; close this issue only if every step in it passed, and record
what failed if one did.

Update 2026-10-07 (CR-218, ADR-031): Postgres, Redis and S3 now run on the same
host from `docker-compose.infra.yml`, deployed by `deploy/deploy.sh`. The smoke
run layers that overlay and proves the data services start healthy, the bucket
is created, `/health` reports `db`/`redis`/`s3` all `ok`, and a `backup` dump
restores into a fresh database. Still unverified: Caddy at runtime, ACME/TLS and
the Caddy → web hop — only a real host with real DNS can show them
(`deploy/FIRST-DEPLOY.md` §3).

Update 2026-10-08 (CR-219): first real deploy to `coffeeride.site` passed
FIRST-DEPLOY §1–4 and §6's checks — Caddy obtained Let's Encrypt certificates
(logged "certificate obtained successfully" for the domain and `www.`), `curl`
without `-k` returns 200 over a valid chain, the Caddy → web → api hop serves
`/api/v1/rides`, `/health` reports all `ok`, the `backup` loop wrote its first dump,
`X-Request-Id` matches the api `reqId`. Still open: §5 (register + verify + reset by
real email) — fails by construction until `EMAIL_FROM_ADDRESS` is a verified
Unisender sender (KI-026/KI-042); and the off-host backup copy (§6). Close this
issue once both are done.

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
Update 2026-10-05 (CR-210): the owner kept the error-mapping half out of
CR-210's scope, so it is now tracked as its own candidate CR
(`project-state.md` → Next §5) rather than as a line inside this issue's
next action. It does not go away with a commercial key: a commercial key
changes the distance limit, it does not stop 403 being how 2GIS refuses a
quota or licence violation, and every 403 still renders as «сервис
недоступен» rather than naming the real cause. Separately, `pnpm preflight`
now warns when `MAPS_2GIS_API_KEY` is unset, and `env.ts` preprocesses its
empty-string-from-Compose value to `undefined` like the other optional
vars (KI-046's fix had missed this one field).

### KI-082 — The basemap watch probes an undocumented 2GIS tile host

Status: open — accepted limitation, guarded by the weekly contract job. Discovered: 2026-10-02 (CR-185).
Correction (CR-200): CR-188 recorded its baseline replacement here by mistake — that
work and its "close once CI is green" belonged to KI-084, closed 2026-10-03 (see the
archive). Nothing about the probe host was ever "fix ready"; it stays open as below.
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

### KI-089 — The emailed verification link doesn't carry the return target (`next`)

Status: open. Discovered: 2026-10-03 (CR-197).
Problem: CR-197 carries `next` from `/register?next=` through the register screen's
dev-only verification link and `/verify-email?next=` to «Перейти ко входу». The real
email link is built by the API (`apps/api/src/modules/auth/auth.routes.ts`,
`${WEB_ORIGIN}/verify-email?token=…`) from a register request that has no `next`, so a
visitor who registers from a ride and verifies from the email still lands on `/me`
after signing in (the register screen's own «Войти» link does keep `next`).
Impact: medium for the conversion path «ride → register → email → sign in»; no
security impact.
Workaround: the «Войти» link on the register success screen keeps the ride.
Next action: owner decision — an optional `next` on `POST /v1/auth/register`
(additive contract change), validated server-side with the same rules as
`apps/web/src/lib/auth/next-path.ts` (that validator would move to `packages/types`)
and appended to the emailed link; or keep it web-only.

### KI-092 — `react-hooks/set-state-in-effect` is a warning, not an error

Status: open. Discovered: 2026-10-06 (CR-212, the Next 16 upgrade).
Problem: eslint-config-next 16 enables React Compiler's hook rules, among them
`react-hooks/set-state-in-effect`. This app loads data with the pattern
"`useEffect` → `setStatus('loading')` → fetch → `setStatus('success')`", which
the rule reports: 28 violations across 26 files (`DiscoveryList`,
`RideDetailView`, `RideWorkspace`, `use-public-rides`, every cabinet widget and
form). Each is a genuine cascading-render smell — the effect renders once,
then immediately re-renders.
Impact: low today (the pattern works; the warning does not fail CI), but it is
28 real findings left unaddressed, and the rule cannot catch a new violation as
an error while it is dialled down.
Workaround: `apps/web/eslint.config.mjs` sets the rule to `warn` (CR-212), so
the violations stay visible in every lint run instead of being silenced with
per-file disables, without blocking a dependency bump on an app-wide refactor.
Next action: its own task — move data loading off the "set state in an effect"
pattern (a `use`/Suspense-based loader, a fetch-on-render hook, or server
components where the page allows it), file by file; then raise the rule back to
`error` and delete this entry. Do not add `eslint-disable` lines in the
meantime.

### KI-091 — Dependabot's Node 26 / Postgres 18 majors are declined, not merged

Status: open (deliberate — a standing decision, not a defect). Discovered: 2026-10-04
(CR-208).
Problem: Dependabot reopens three Node majors (PRs #19 `/apps/api`, #20 `/apps/web`,
#21 `/packages/db`: `node:24-alpine` → `26-alpine`) and one Postgres major (PR #15:
`postgres:17-alpine` → `18-alpine`) every week. Both are runtime/framework majors,
which `dependabot-triage` routes to a planned CR rather than a bump-PR merge.
Impact: recurring red/stale PRs in the queue; no runtime risk while unmerged. Node 24
is the LTS this project pins (`package.json` `engines.node >=24.0.0`, `.nvmrc`, all
three Dockerfiles — CR-067); Node 26 only enters LTS in late October 2026. Postgres 18
needs a data-directory upgrade path for `docker-compose.prod.yml`'s volume, which is
not a lockfile change.
Workaround: leave the PRs open as a reminder (the owner's call, 2026-10-04) rather
than closing them with an `ignore` rule — an `ignore` entry would also hide the
eventual LTS transition.
Next action: Node 26 — revisit once it is the active LTS and `.nvmrc`/`engines`/the
three Dockerfiles move together as one CR. Postgres 18 — its own CR covering the
`pg_upgrade`/dump-restore path for the production volume, before touching the image
tag.

### KI-095 — `braces` (GHSA-vfj7-8cjw-p6xm) has no patched release; one dev-only path remains

Status: open. Discovered: 2026-10-07 (CR-214).
Problem: `pnpm audit` reports one high: `braces@3.0.3` (stack-exhaustion DoS through
deeply nested brace patterns; every version vulnerable, "patched: <0.0.0"). CR-214
dropped the `lint-staged` path (17 uses picomatch); the remaining one is
`apps__web>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces`.
Every `fast-glob` release uses micromatch, so no override can remove it.
Impact: low — dev/CI lint only, never in a runtime image; the patterns it expands are
the repo's own ESLint globs, never user input.
Workaround: none needed. Don't silence it with `auditConfig.ignoreGhsas` — the audit
should keep showing it until it is really gone.
Next action: external — a `braces`/`micromatch` fix, or `@next/eslint-plugin-next`
dropping `fast-glob`; re-run `pnpm audit` on each Next/eslint-config-next bump (CR-208).

### KI-096 — A missing ride's 404 body is rendered on the client

Status: open. Discovered: 2026-10-08 (CR-224).
Problem: `/rides/[id]` answers a real HTTP 404 (`notFound()` after `lookupRide`), but
Next 16 serves `notFound()` thrown from a page as an empty HTML shell + RSC payload
(`<template data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404">`); the root layout,
`h1` «Заезд не найден» and the CTA appear after hydration. Checked on `next dev` and
a production build. An unknown URL (`app/not-found.tsx`) is fully server-rendered.
Impact: low — status and `noindex` are right, JS clients/crawlers see the `h1`
(e2e `not-found.spec.ts`); a no-JS client sees a blank 404.
Workaround: none needed. A `<Suspense>` around the page would start streaming and turn
the status back into 200 — don't.
Next action: if it matters, Next's documented route — a `proxy.ts` check that rewrites
a missing ride to a not-found route — at the cost of an API call per ride request.

### KI-097 — Page CSP keeps `'unsafe-inline'` for scripts

Status: open. Discovered: 2026-10-08 (CR-226, QA live audit item 8).
Problem: `lib/security/headers.ts` restricts every origin, but scripts allow
`'unsafe-inline'`: Next's per-page inline bootstrap (`self.__next_f.push`) and the
theme init script need a per-request nonce, which makes every page dynamic (the
discovery page is statically prerendered today).
Impact: an injected inline `<script>` would still run; external scripts, connections,
frames, forms and framing are blocked.
Workaround: none. Keep new inline scripts out of the app.
Next action: an ADR on nonce CSP via `proxy.ts` (all pages dynamic) vs. the status quo;
re-inventory 2GIS hosts on any MapGL upgrade (`*.2gis.com`, `blob:` workers).

## Resolved

Moved to `.claude/context/known-issues-archive.md` (37 entries) on 2026-09-20, per this
file's own Archiving rule — this section had grown to ~1050 lines of closed issues.
