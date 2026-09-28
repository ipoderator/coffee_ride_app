# Current task

## CR-151 — «Постер заезда v2»: ride detail page redesign

Status: done (2026-09-28), committed. See `docs/changelog.md` → CR-151.

Source: owner's mockup artifact «Постер заезда v2»
(claude.ai/artifact/53Xd8J8MwTp7iDvk1gJBk4) — «давай реализуем».

### Goal

Rebuild `/rides/[id]` to the mockup: title head → dark hero (track cover ⇄ 2GIS
map switch on the cover, numbers band under it) → a perforated «ticket» that
holds the whole registration flow (sticky aside from `lg`, straight under the
hero on a phone, a fixed bottom bar only once the ticket scrolls away) → main
column (chips + description, «Маршрут по точкам» timeline with km, elevation
profile linked to a dot on the cover, GPX/share, «Кто едет» avatar stack).

### Requirements / decisions

- API, additive (`GET /v1/rides/:id`): `waitlistCount`, `viewerStartNumber`
  (1-based rank of the viewer's active registration by `createdAt, id`),
  `viewerWaitlistPosition` (same over `waiting` entries — the FIFO promotion
  order). The mockup's «№ 7» needs the first; «В очереди 3 человека» the
  second.
- Cancellation reason: no model field → the line is dropped (mockup offered
  «новое поле либо убрать строку»); banner says the ride was cancelled.
- No track → the cover draws only the points, never joins them.
- Map view = the existing `RouteMap` (2GIS) or its degraded placeholder; the
  elevation scrub dot is drawn on the track view only.
- Missing metric → `—` in the numbers band (design.md §6).
- Mockup-only chrome (data/state switches, notes) is not built.

### Acceptance criteria

- Every registration state renders in the ticket: open, few seats (≤ 3), full
  (waitlist), waitlisted viewer, registered (number, countdown, group change,
  cancel), closed, not-yet-open, started/finished, cancelled.
- All existing registration/waitlist/group behaviour is preserved (same API
  calls, confirm dialogs, toasts, login redirect).
- web/api tests, typecheck, lint green; e2e specs touching the page updated.

### Progress

- [x] API fields + tests + types + docs/api.md
- [x] ui: SegmentedControl, terms, formatters
- [x] ride-detail components
- [x] tests (unit + e2e); coverage baseline raised
- [x] docs/context
- visual baselines: see changelog CR-151 «Validation».

## CR-146 — Self-hosted web fonts (+ known-issues sweep)

Status: done (committed). See `docs/changelog.md` → CR-146. Pending: CI's
visual-regression job is the first x86_64 check of the new font files.

## CR-150 — Organizer sidebar highlight on ride sub-pages

Status: done (committed). «Участники»/«Обновления» redirect to
`/organizer/rides/[id]/participants|updates`; the prefix rule lit «Заезды».
Fix: `CabinetNavItem.activeOn`. Validation: web 444/444, typecheck/lint green.
See `docs/changelog.md` → CR-150.

## CR-149 — Organizer cabinet → rider profile card

Status: done (committed).

### Goal

From the organizer cabinet, open a participant's profile directly (owner's
screenshot: the name in «Новые записи»). Owner chose «профиль участника по
клику» over a more visible switch to their own `/me` (that link already exists
in the avatar menu).

### Acceptance criteria

- Name in `/organizer` «Новые записи» → `/rides/[id]/riders/[registrationId]`.
- Same in `/organizer/rides/[id]/participants`.
- Card's back link returns to where it was opened from.
- Works for the organizer even when the ride's riders list is hidden.

### Result

See `docs/changelog.md` → CR-149. Validation: api registrations 60/60, web
443/443, ui 155/155, typecheck/lint green, dev-server check of back links.

## Pending from CR-148

`pnpm seed:demo` with routes once 2GIS is reachable (KI-056); then check
CR-148 off in `docs/tasks.md`.
