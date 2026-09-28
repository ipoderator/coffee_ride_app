# Current task

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
