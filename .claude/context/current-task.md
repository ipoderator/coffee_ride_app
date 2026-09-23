# Current task

## CR-115…CR-120 — «Топокарта» redesign + pace groups + participant list

Started 2026-09-23. Direction chosen by the product owner after `/impeccable critique
apps/web` (21/40): «Топокарта» (orienteering-map world). Scope agreed in the shape brief:
discovery + ride detail first, tokens rolled out app-wide at once, additive API fields
for the list. Added by the owner the same day: pace groups (a ride has N groups, each
with its own average speed, e.g. 25 / 30 / 35 km/h) and a list of everyone who is
riding.

Previous pending work (CR-108…CR-114) committed as `f095715` before starting.

### Sub-tasks

| CR     | What                                                                                                                                                                                                        | Owner               | Wave |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---- |
| CR-115 | «Топокарта» tokens (light/dark), fonts (Golos Text + Sofia Sans Condensed, `lang="ru"`), design.md §1/§3/§4 rewrite, ADR-021                                                                                | sub-agent           | 1    |
| CR-116 | `GET /v1/rides` additive fields: `registrationsCount`, `startLabel`, `routePreview` (simplified geometry)                                                                                                   | sub-agent (backend) | 1    |
| CR-117 | Pace groups: `RideGroup` entity (ADR-022), migration, organizer CRUD, `groupId` on registration, groups in ride detail/list, participant list public read, dev seed: test ride with 2 groups (25 / 35 km/h) | sub-agent (backend) | 1    |
| CR-118 | Discovery: legend-row card, map pins with start time, markers follow filters, list↔map sync                                                                                                                 | sub-agent (web)     | 2    |
| CR-119 | Ride detail: map-first layout, groups + group choice at registration, «Участники» list                                                                                                                      | sub-agent (web)     | 2    |
| CR-120 | Organizer: groups editor, group column on the participants page                                                                                                                                             | sub-agent (web)     | 2    |

Rules for every sub-agent: no `next build` / `turbo build` for web while the dev server
runs on :3000 (it shares `apps/web/.next`); docs/changelog.md, docs/tasks.md,
.claude/context/* are updated centrally by the main session, not by sub-agents.

### Decisions

- Participant list visibility: signed-in users see display names + group of active
  participants; anonymous visitors see the count only. Never email/phone/emergency data.
- Registration into a ride that has groups requires choosing a group; capacity stays
  ride-level (no per-group limits in this iteration).

### Acceptance

- typecheck + lint + tests green (api with `TEST_DATABASE_URL`), web tests for new UI.
- Main session reviews every sub-agent diff and re-runs checks; browser check at 1440
  and 390 px, light + dark, on the running dev server.

### Progress

- [x] wave 1
- [x] wave 1 review (committed `3fe806b`; api 417, web 242, ui 125)
- [x] wave 2 (CR-118…CR-120)
- [x] wave 2 review (main session: diff review, full test runs, screenshots; fixes:
      one `pluralRu`, `formatStartPlace`)
- [x] docs/context (changelog, ADR-021/022, design.md, api.md, database.md,
      project-state, architecture-map, known-issues, tasks)
- [x] commit wave 2

### Validation results

- typecheck + lint: clean (17/17 turbo tasks).
- tests: api 417 passed + 3 skipped (with `TEST_DATABASE_URL`), web 292, ui 132,
  maps-2gis 30.
- Screenshots reviewed by the main session at 1440 and 390 px: discovery, ride
  detail (anonymous + signed-in, dark), organizer groups and participants.

### Discovered issues

- Critique P2: discovery markers never update after the first render (filter change).
  Fixed in CR-118.
- Follow-ups recorded in `.claude/context/known-issues.md`: KI-057 (2GIS basemap
  light in dark theme), KI-058 (`routePreview` computed per list request), KI-059
  (no rider avatars), KI-060 (list start place only from the route-point label),
  KI-061 (ride sub-page links not a registry), KI-062 (pace 0.5 step client-only),
  KI-063 (local MinIO stopped), KI-064 (critique P0: `/login` has no `?next=`).
- Incident: a sub-agent's `pkill -f cat` killed Docker Desktop and the session;
  briefs now forbid broad `pkill -f`/`killall` (see changelog entry).

### Final result

Done and reviewed: «Топокарта» visual direction (ADR-021), pace groups
(`RideGroup`, ADR-022, migration 0017), discovery and ride detail rebuilt
map-first, rider list, organizer groups editor and grouped participants. Glass and
both feature flags removed. Next: KI-064 (login `?next=`), then KI-057 (2GIS dark
basemap).
