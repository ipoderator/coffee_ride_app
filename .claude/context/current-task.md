# Current task — CR-181: finish self-check-in, organizer confirms in bulk

> Previous task (CR-171/172) is complete and committed; its record lives in
> `docs/changelog.md` and `project-state.md`.

## Goal

Owner's request (2026-10-02): a participant self-reports "I finished"; the organizer
confirms selectively or in one batch («подтвердить всех заявивших финиш») in about a
minute, and can mark participants who did not come. A participant's claim stays a
**claim** until the organizer confirms it.

## Requirements (draft — awaiting owner decisions, see "Open decisions")

- Per active registration: `finishClaimedAt` (participant) and an organizer-owned
  outcome `attendance`: `null` (undecided) | `finished` | `no_show`.
- Participant: `POST /v1/rides/:id/finish-claim` (and `DELETE` to withdraw) while the
  ride is `started` or `finished`; identity from the session only; idempotent.
- Organizer, owner-only, in one transaction each:
  - `POST /v1/rides/:id/attendance/confirm` `{ registrationIds: string[] }` — selective;
  - `POST /v1/rides/:id/attendance/confirm-claimed` — every claimed, undecided one;
  - `POST /v1/rides/:id/attendance/no-show` `{ registrationIds }` — and reverting a
    mark (`PUT` back to `null`).
- `GET /v1/rides/:id/participants` gains additive `finishClaimedAt`, `attendance`.
- Organizer participants page: claim badge, row checkboxes, sticky «Подтвердить всех
  заявивших (N)» bar, per-row «Не пришёл».
- Participant ticket on `/rides/[id]`: «Я финишировал» → «Ждёт подтверждения» →
  «Финиш подтверждён» / «Не отмечен».

## Acceptance criteria

- A claim never changes a participant's recorded outcome by itself.
- Batch confirm touches only claimed + undecided rows of this ride; a non-owner gets
  403/404; a cancelled registration is never touched.
- No-show is reversible; confirmed outcome is attributable (`attendanceBy/At`).
- Tests: service/routes (ownership, idempotency, status gating, batch), web
  (organizer table, ticket states); migration with CHECK invariants; typecheck/lint/
  coverage; docs (`api.md`, `database.md`, `design.md`), ADR only if the owner picks
  an outcome that changes review eligibility.

## Planned files

- `packages/db/src/schema/registration.ts` + migration `0023_registration_attendance`
- `packages/types/src/api/registrations.ts`
- `apps/api/src/modules/registrations/` (service, routes, tests)
- `apps/web/src/features/organizer/participants/`, `participant/ride-detail/`
- `packages/ui/src/terminology.ts`, Storybook stories for new states
- docs/context files

## Implementation progress

- [x] Owner decisions (started+finished; separate `attendance` field; review only after confirmation)
- [x] Migration 0023, types, API (4 endpoints), review gate
- [x] Web: ticket check-in, review hint, organizer panel + row actions
- [x] Tests, stories, docs, ADR-027

## Decisions (owner, 2026-10-02)

1. Claim window: `started` and `finished`.
2. `attendance` is its own field; no-show stays an active registration.
3. Review only after the organizer confirms (ADR-027).

## Validation results

typecheck 8/8, lint 9/9, tests: api 556 (+8 live skipped), web 570, ui 219, maps-2gis 65;
Storybook 100/100 (axe). New: `attendance.routes.test.ts` 13, ticket 7, organizer panel 6.

## Discovered issues

Existing review tests silently relied on "active registrant may review"; they now go
through the real claim + confirm-claimed flow.

## Final result

Implemented, not committed. Not run: coverage gate, Playwright, live browser check.
