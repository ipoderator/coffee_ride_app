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

- [ ] wave 1 - [ ] wave 1 review - [ ] wave 2 - [ ] wave 2 review - [ ] docs/context

### Validation results

(pending)

### Discovered issues

- Critique P2: discovery markers never update after the first render (filter change).
