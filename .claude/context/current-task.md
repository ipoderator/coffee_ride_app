# Current Task

## Status

complete

## Task ID

CR-027 — GPX upload

## Goal

`docs/tasks.md`'s Route section: next unchecked ticket after Rides (CR-017..CR-026 all
done). `docs/product.md` MVP item 5 "GPX route"; `docs/api.md`'s Route section already
reserves `POST`/`PATCH`/`DELETE /v1/rides/:id/route`; `docs/design.md` §8 already lists
`/organizer/rides/[id]/route` ("Route, GPX upload, stops, route points").

Selected via the same "next unchecked box" discipline `/next` used for CR-026 — Route is
the section after Rides, and CR-027 is its first ticket.

## Investigation before deciding scope

- **CR-085 dependency** (`docs/tasks.md` Contract & model follow-ups: "GPX parsing must
  not block the event loop: size limit, streaming or worker — needed by CR-027"), still
  unchecked. Resolved inline as part of this ticket's own scoping — same precedent as
  CR-084/CR-026, CR-089/CR-020, CR-090/CR-022. Recorded as **ADR-015** (real,
  durable architectural choice, `.claude/rules/architecture.md` change control).
  - Decision: hard upload size cap (10 MB via `@fastify/multipart`'s `limits.fileSize`
    — generous for a real ride GPX; a 24h continuous recording at 1 point/sec with
    lat/lon/ele/time is still well under this) + a streaming SAX parser (`sax` package)
    that processes the buffered upload incrementally rather than building a full DOM
    parse tree, so no single call does unbounded work proportional to an uncapped file.
    No worker thread — the size cap already bounds worst-case synchronous work to a
    small, fixed amount, and a worker adds process/IPC complexity `.claude/rules/
resilience.md`'s "only when justified" discipline doesn't support yet (same
    reasoning ADR-014 used to defer PostGIS). Revisit if a real perf problem appears
    once route data at scale is actually observed.
- **What `Route`/`RoutePoint` actually mean** (`docs/database.md`'s one-line domain
  descriptions, read before assuming): "Route — route geometry and metadata,"
  "RoutePoint — start/finish/stop/danger/water/food/technical/other." `RoutePoint` is a
  small set of organizer-placed _typed_ markers along the route (its own ticket,
  CR-031) — NOT one row per raw GPX trackpoint (which would be thousands of rows for a
  long ride). Decision: the parsed GPX polyline (potentially thousands of points) is
  stored as a single `jsonb` array column on the new `routes` table itself
  (`geometry: { lat, lng, elevationMeters }[]`), not as per-point rows — avoids
  misusing the `RoutePoint` entity for a different concept and avoids an unnecessary
  thousands-of-rows table for data that's always read/written as one unit (the whole
  track), never queried per-point.
- **Route vs Ride's own distance/elevation fields**: `Ride.distanceKm`/
  `elevationGainMeters`/etc (CR-018) are organizer-entered manual fields, already
  shipped. This ticket's `routes.distanceKm`/`elevationGainMeters` are independently
  _computed from the actual GPX_ (haversine sum / positive-elevation-delta sum) and
  live on the new `Route` row — deliberately not overwriting `Ride`'s manual fields
  (no named requirement says the GPX should override organizer-entered numbers, and
  silently doing so could surprise an organizer who intentionally rounded/adjusted
  their own figures). Recorded as a new known issue (`routes` and `rides` carry two
  independent distance/elevation figures with no reconciliation) rather than silently
  auto-syncing — candidate for CR-029 ("Route metadata") to resolve deliberately.
- **Where the raw GPX file lives**: S3-compatible storage (`apps/api/src/s3.ts`,
  built CR-006, never yet a real consumer — KI-015). This ticket is the first real S3
  consumer. Per `.claude/rules/resilience.md` (explicit timeout, bounded retry only
  for idempotent ops, circuit-breaker-equivalent short-circuit, defined fallback) and
  since CR-049 (the shared timeout/retry/circuit-breaker utility) isn't built yet,
  this ticket adds a small scoped wrapper (`route-storage.ts`: timeout + one bounded
  retry on PUT/GET/DELETE, all idempotent) local to the rides module, not a new shared
  package — same "add the minimal real thing now, generalize later" precedent as
  every other module in this repo. `docker-compose.yml`'s MinIO cannot be started in
  this environment (Docker daemon unreachable, KI-019/KI-015 standing constraint) —
  the S3 upload/download/delete code path is implemented and unit-tested with the S3
  client's `send` mocked (same technique CR-008 used for `maps-2gis`'s `fetch`), but
  cannot be live-verified against a real MinIO this session. Documented as an
  extension of KI-015, not silently claimed as verified.
- **Download**: `docs/product.md` Principle 2 / Positioning explicitly promises "the
  route (viewable and downloadable as a track)." `docs/api.md`'s Route section doesn't
  list a download endpoint, but this is an additive addition needed to fulfill an
  explicit product requirement (same "the doc doesn't name it but the product spec
  requires it" reasoning KI-024/KI-025/KI-027 used to add a missing ticket/endpoint) —
  `GET /v1/rides/:id/route/download` streams the file through the API (not a public
  bucket URL/pre-signed link — MinIO bucket ACL is unconfigured/unknown, proxying is
  the safe default), gated by the same viewer-visibility rule CR-023 established for
  `GET /v1/rides/:id` (owner always, others only once non-`draft`).
- **Status gate on route mutation**: no product/design doc states whether a route can
  be changed after publish. Decision: same draft-only gate `PATCH /v1/rides/:id`
  already uses (`409 ride_not_editable`, reusing the existing code — same meaning,
  "ride configuration is locked once published") rather than inventing a new code or
  leaving it ungated. Simplest, most consistent choice; revisit if a real post-publish
  route-correction need is ever named.
- **Full geometry exposure**: `GET /v1/rides/:id` gains an additive `route` field but
  only a _summary_ (id/distanceKm/elevationGainMeters/pointCount/fileName/createdAt),
  not the full `geometry` array — rendering the actual polyline/elevation chart is
  CR-028's ("Route rendering") job and needs its own endpoint/decision once it exists;
  shipping the full point array on every ride-detail response today has no consumer
  and needlessly bloats the payload.

## Scoping decisions

- **`packages/db`**: new `routes` table — `id`, `rideId` (FK → `rides`, `ON DELETE
CASCADE`, unique — one route per ride), `gpxFileKey`/`gpxFileName`/
  `gpxFileSizeBytes` (not null), `distanceKm numeric(6,1)`/`elevationGainMeters
integer`/`pointCount integer` (not null, computed at upload time), `geometry jsonb`
  (not null), `createdAt`/`updatedAt` (`timestamptz`), `updatedBy` (nullable FK →
  `users`, `ON DELETE SET NULL`, audit trail). CHECKs: `distanceKm >= 0`,
  `elevationGainMeters >= 0`, `pointCount >= 1`, `gpxFileSizeBytes > 0`.
- **GPX parsing** (`apps/api/src/modules/rides/gpx.ts`): streaming SAX parse
  (`trk > trkseg > trkpt[lat,lon] > ele`) into `{ lat, lng, elevationMeters }[]`;
  reject (400 `gpx_invalid`) if zero track points found. Haversine distance sum,
  positive-elevation-delta sum. Pure functions, unit-tested against small hand-built
  GPX fixtures with known distance/elevation (no live dependency).
- **S3 wrapper** (`apps/api/src/modules/rides/route-storage.ts`): `uploadGpxObject`/
  `downloadGpxObject`/`deleteGpxObject`, each with an `AbortController` timeout (8s)
  and one bounded retry (idempotent PUT/GET/DELETE), throwing `RouteStorageError` on
  exhausted failure → mapped to `503 route_storage_unavailable` (RFC 9457, degraded
  state per `.claude/rules/resilience.md`, not a generic 500).
- **API routes** (`apps/api/src/modules/rides`, extends the existing module):
  - `POST /v1/rides/:id/route` — multipart (`@fastify/multipart`, new dependency),
    draft-only, 409 `route_already_exists` if one exists, 400 `gpx_invalid`/
    `gpx_file_too_large`/`gpx_file_missing` as appropriate, 201.
  - `PATCH /v1/rides/:id/route` — same upload, requires an existing route (404
    `route_not_found` otherwise), replaces the S3 object + row.
  - `DELETE /v1/rides/:id/route` — 404 if none; deletes DB row then best-effort
    deletes the S3 object (logged, not blocking, per resilience: DB state is the
    source of truth).
  - `GET /v1/rides/:id/route/download` — streams the raw GPX bytes, same
    viewer-visibility rule as `GET /v1/rides/:id`.
  - `GET /v1/rides/:id` response gains additive `route: RouteSummary | null`.
- **`packages/types`**: `Route`/`RouteSummary` domain types (`domain/route.ts`), no
  new Zod body schema needed (multipart, not JSON — validated by hand in the route
  handler, matching the size/extension checks named above).
- **Web** (`apps/web/src/features/organizer/route/`, new feature module — ADR-009):
  `/organizer/rides/[id]/route` screen, `RouteUploadForm` (native file input,
  duplicate-submit protection, loading/empty/error/degraded states —
  `ErrorState tone="warning"` + "Загрузка недоступна" for a `route_storage_unavailable`
  response, exact copy `docs/design.md` §10 already names), a summary card
  (distance/elevation/point count via `MetricTile`), download link, delete button.
  `/organizer/rides/[id]/edit` gains a "Маршрут" link into the new screen (same
  pattern CR-017/CR-018 used to link between create/edit).
- **`packages/ui/src/terminology.ts`**: new `RIDE_ROUTE_TERMS`.
- **New ADR**: ADR-015 in `docs/decisions.md` (GPX size/streaming decision — see
  Investigation above).

## Requirements

- `docs/decisions.md`: append ADR-015.
- `packages/db/src/schema/route.ts` (new) + migration.
- `packages/types/src/domain/route.ts` (new).
- `apps/api/src/modules/rides/{gpx.ts,gpx.test.ts,route-storage.ts,rides.routes.ts,
rides.service.ts,ride-response.schema.ts,rides.routes.test.ts}`.
- `apps/api/package.json`: `@fastify/multipart`, `sax` (+ `@types/sax` if needed).
- `apps/web/src/features/organizer/route/` (new) + `EditRideForm`/nav link + tests.
- `packages/ui/src/terminology.ts`.
- `docs/api.md`, `docs/database.md`, `docs/tasks.md`,
  `.claude/context/known-issues.md`.

## Acceptance criteria

- ADR-015 accepted and recorded.
- `packages/db`: migration applies cleanly; CHECK constraints reject invalid rows.
- GPX parsing unit tests pass against fixture files with hand-computed
  distance/elevation; an invalid/non-GPX file is rejected.
- `POST/PATCH/DELETE /v1/rides/:id/route`: ownership-checked (404 either way),
  draft-only (409), size/type validated (400), S3 failure surfaces
  `503 route_storage_unavailable` (mocked in tests) rather than a 500 or a silently
  corrupted ride.
- `GET /v1/rides/:id/route/download` respects the same viewer-visibility rule as ride
  detail.
- `GET /v1/rides/:id` additively includes a `route` summary.
- Web `/organizer/rides/[id]/route`: upload/replace/delete work end to end against a
  mocked S3 layer or documented as unverified where real S3 is required; degraded
  state shown on a storage failure; reachable from the edit screen.
- `turbo run lint/typecheck/build/test` green; `format:check`/`lint:root` clean.
- Live check: curl sequence for ownership/draft-gate/validation (real Postgres, S3
  calls exercised against whatever this session can verify — see known-issue
  extension of KI-015 if MinIO stays unreachable) + browser walkthrough of the upload
  screen's non-S3-dependent states (loading/validation/nav).

## Planned files

- `docs/decisions.md`, `docs/api.md`, `docs/database.md`, `docs/tasks.md`,
  `.claude/context/known-issues.md`.
- `packages/db/src/schema/{route.ts (new),index.ts}` + generated migration.
- `packages/types/src/domain/route.ts` (new), `packages/types/src/index.ts` if needed.
- `apps/api/src/modules/rides/{gpx.ts (new),gpx.test.ts (new),route-storage.ts (new),
rides.routes.ts,rides.service.ts,ride-response.schema.ts,rides.routes.test.ts}`.
- `apps/api/src/app.ts` (register `@fastify/multipart`), `apps/api/package.json`.
- `apps/web/src/features/organizer/route/{components/RouteUploadForm.tsx (new),
api.ts (new),route.test.tsx (new)}`, `apps/web/src/app/organizer/rides/[id]/route/
page.tsx` (new), `EditRideForm.tsx` (nav link).
- `packages/ui/src/terminology.ts`.

## Implementation progress

- [x] Plan written (this file)
- [x] ADR-015
- [x] `packages/db` schema + migration
- [x] GPX parsing module + unit tests
- [x] S3 wrapper
- [x] `packages/types` changes
- [x] `apps/api` routes/service/tests
- [x] `apps/web` route screen + nav link
- [x] `packages/ui` terminology
- [x] Full validation
- [x] Live check
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `pnpm --filter api exec vitest run`: 8 files, 151 tests, all green
  (7 new `gpx.test.ts`, 18 new `route.routes.test.ts`).
- `pnpm --filter web exec vitest run`: 10 files, 95 tests, all green
  (10 new `route.test.tsx`; two `ride-detail.test.tsx` mocks updated for
  `GetRideResponse`'s new required `route` field).
- `turbo run lint typecheck test` (all 8 packages) + `turbo run build`
  separately: all green. Combining all four into one `turbo run` command
  locally raced `web`'s `typecheck`/`build` against a stale `.next` (Next.js
  generates `.next/types` during `build`, which `typecheck`'s tsconfig
  `include` pattern depends on, and this repo's `typecheck` task has no
  same-package dependency on `build`) — not a bug introduced by this
  ticket, not something CI hits (`.github/workflows/ci.yml` already runs
  every task as its own sequential step), so no config change was made;
  ran sequentially instead, per CI's own discipline.
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (cosmetic only, 9 files).
- Live check via curl against a real Postgres + a freshly started `apps/api`
  (no `S3_*` configured): register → verify → login → organizer profile →
  create ride, then 401 (no session) / 404 (non-existent + stranger's ride)
  / `gpx_invalid` (malformed file) / `503 route_storage_unavailable`
  (S3 unconfigured — cross-checked against a direct DB read: no orphaned
  `routes` row, since the S3 call happens before the DB insert) / `409
ride_not_editable` (after publish) / `404 route_not_found` (download with
  none uploaded) — every response matched its documented contract.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + `apps/api`: a fresh draft ride's `/organizer/rides/
[id]/route` showed the empty state (file input + "Загрузить трек" button);
  selecting a file and submitting correctly showed the degraded "Загрузка
  недоступна. Попробуйте ещё раз позже." notice, not a crash or blank page
  (1 expected console error — the 503 itself); a published ride correctly
  hid the upload/replace/delete controls behind the draft-only notice. All
  test accounts/rides/organizer profile deleted from the scratch DB by
  id/email afterward.
- Every acceptance criterion from above is met, with the S3 live-round-trip
  caveat explicitly carried forward as KI-015 (widened, not new) rather than
  claimed as verified.

## Discovered issues

- `apps/api/src/plugins/error-handler.ts` unconditionally redacted every
  `>=500` status to a generic `internal_error` — correct for a genuinely
  unexpected failure (no `title` set), but wrong for this ticket's own
  deliberate `route_storage_unavailable` (503), the first domain error in
  this codebase with a `>=500` status. Fixed by keying the redaction on
  whether the error carries a `title` (the same signal the `<500` branch
  already used). Caught by `route.routes.test.ts`'s own storage-unavailable
  tests (500 instead of the expected 503) before being reported as done.
- New KI-034 (`Route`/`Ride` distance-elevation figures not reconciled) and
  KI-035 (no full-geometry endpoint yet) — both recorded in
  `.claude/context/known-issues.md` with an explicit next action, not
  silently dropped.
- KI-015 widened, not resolved — S3 upload/download/delete is now a real,
  tested code path, but every test mocks the S3 client; never run against a
  live MinIO (Docker unreachable in this environment, standing constraint).

## Final result

CR-027 ("GPX upload") and its prerequisite CR-085 (event-loop-safety
decision) both complete, decided/implemented together (ADR-015, same
precedent as ADR-014/CR-026). `packages/db` gained a fifth table, `routes`
(one per ride, GPX-parsed polyline + computed distance/elevation/point
count). `apps/api` gained its first real S3 consumer
(`route-storage.ts`, a scoped timeout+bounded-retry wrapper) and a streaming
GPX parser (`gpx.ts`, ADR-015). `POST`/`PATCH`/`DELETE /v1/rides/:id/route`
(multipart, draft-only) and a new `GET /v1/rides/:id/route/download`
endpoint are live; `GET /v1/rides/:id` additively exposes a `route` summary.
`apps/web` gained a new organizer feature module and
`/organizer/rides/[id]/route` screen with full loading/empty/error/success/
degraded states, reachable from the edit screen. A real pre-existing bug in
the shared RFC 9457 error handler (every `>=500` status silently redacted,
even a deliberate domain error) was found and fixed along the way. No live
MinIO exists in this environment, so the S3 code path is unit-tested with
the client mocked and live-verified only for its degraded response — not
claimed as a verified live round trip (KI-015, widened). All acceptance
criteria met; full validation suite green (lint/typecheck/test/build across
all 8 packages, sequentially to avoid an unrelated local `turbo`/Next.js
race); live-verified end to end over both curl (ownership/validation/
degraded-state contract) and a real browser session (upload screen states).
`docs/tasks.md`, `docs/changelog.md`, `.claude/context/{project-state,
known-issues}.md`, `docs/api.md`, `docs/database.md`, `docs/decisions.md`
all updated. Not yet committed — `git diff`/`git status` reviewed, contains
exactly the planned files plus the one incidental `error-handler.ts` fix
required for the ticket's own acceptance criteria, no unrelated changes.

## Final result

(fill in at completion)
