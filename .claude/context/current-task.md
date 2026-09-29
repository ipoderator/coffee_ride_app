# Current task

## CR-155 — Ride page `/rides/[id]` to the owner's mockup + ride requirements

Status: **done, committed** (2026-09-29). Validation: see `docs/changelog.md` CR-155; follow-up KI-079. Previous tasks CR-153/CR-154 are done and
recorded in `docs/changelog.md`.

Mockup: owner's screenshot (dark theme, desktop 1440) — «Гравий на выходные:
Крылатское — Архангельское». No phone mockup: phone keeps today's order (ticket under
the hero, bottom bar).

### Decision (owner, 2026-09-29)

«Требования» is a real new ride field (not derived from bike/difficulty): DB + API +
organizer form + ride page.

### Gap table

| In mockup                                                      | Was                                                | Needs                               |
| -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| Hero card in the left column, ticket beside it at the same top | full-width hero, ticket below                      | frontend                            |
| 4 equal metric columns, all white; «Темп», «В пути»            | amber elevation, «Средний темп» + «2 группы» note  | frontend + terms                    |
| Ticket head «СТАРТОВЫЙ ЛИСТ» + status badge                    | big «№ 14» stub, perforation, status chip on cover | frontend                            |
| Big «13 из 20 участников», bar, «Осталось 7 мест»              | small seats line, date/start cells                 | frontend                            |
| «Выберите группу» — stacked radio cards                        | horizontal segments                                | frontend                            |
| per-group «Осталось 4 места»                                   | —                                                  | no per-group limit → «записались N» |
| «Записаться»                                                   | «Зарегистрироваться»                               | terms                               |
| GPX / «Добавить в календарь» / «Поделиться» rows in ticket     | GPX/share in main column, no calendar              | frontend + terms (client .ics)      |
| Timeline: small «69,5 км», rings, hazard in warning + ⚠        | big km numbers, filled icon nodes                  | frontend                            |
| «Профиль высоты» own section: h2, «макс. · мин.», card         | label inside the route section                     | frontend + terms                    |
| «О заезде» h2 + description                                    | description without heading, chips above           | frontend                            |
| «Требования» check list                                        | no data                                            | DB + API + organizer form           |
| «Все заезды» back link                                         | «Ко всем заездам»                                  | terms                               |

Not taken: text under 12px, header bell/avatar (CR-154 header stays), dropping the
«Трек / Карта» switch. «Кто едет» and reviews stay below.

### Requirements

- DB: `ride_requirements` (`RideRequirement`): `id`, `ride_id` FK cascade, `text`
  (1–120 chars, CHECK), `position` (0..n-1, unique per ride), `created_at`. Max 10 per
  ride (service + Zod).
- API (additive): `PATCH /v1/rides/:id` optional `requirements: string[]` (replace
  the whole list, draft-only like every field, same transaction as the ride update);
  `UpdateRideResponse.requirements`, `GetRideResponse.requirements` (`string[]`,
  position order).
- Organizer: requirements list editor in `EditRideForm` (add/remove lines).
- Ride page: layout/ticket/timeline/profile/about+requirements per the gap table.

### Acceptance criteria

- Route tests: set/replace/clear requirements, >10 or empty/too-long line → 400,
  non-draft → 409, non-owner → 404, detail returns them in order.
- Ride page renders the new layout; every ticket state still works (existing tests
  updated, new ones for calendar/requirements).
- typecheck/lint/tests green for db/types/api/web/ui; screenshots 390/1440 checked.
- Docs: `docs/api.md`, `docs/database.md`, `docs/design.md`, changelog, tasks,
  project-state, known-issues (KI for visual baselines).

### Progress

- [x] DB schema + migration
- [x] types + API + tests
- [x] organizer form
- [x] ride page
- [x] validation + screenshots
- [x] docs/context
