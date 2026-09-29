# Current task

## CR-156 — Ride creation as a four-step wizard (owner's mockup)

Status: **done, committed** (2026-09-29). Validation: see `docs/changelog.md`
CR-156. Previous task CR-155 is done and recorded in `docs/changelog.md`.

Mockup: owner's screenshot (dark, desktop) — «Новый заезд · шаг 1 из 4»,
«Основное о заезде». No phone mockup.

### Decision (owner, 2026-09-29)

«Мастер + additive API»: step 1 to the mockup; `POST /v1/rides` takes optional
`description`/`difficulty` (one atomic create); GPX uploads right after the create;
steps 2–4 are the existing route/groups/edit screens in the same step frame.

### Gap table

| In mockup                                       | Was                               | Result                                      |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------- |
| Step list «шаг 1 из 4», four steps with hints   | none                              | done (`RideWizardSteps`)                    |
| «Основное о заезде» + lead inside the card      | «Новый заезд» page h1             | done                                        |
| Title + example hint                            | title + «До 140 символов»         | done                                        |
| Date / «Время старта · МСК»                     | one datetime-local + zone select  | done (zone select beside the time label)    |
| Bike type / Сложность                           | bike type only                    | done (API additive for difficulty)          |
| Описание                                        | not at creation                   | done (API additive)                         |
| GPX drop zone                                   | only on the route screen          | done (`GpxDropzone`, upload after save)     |
| «Сохранить черновик» / «Далее: маршрут →»       | «Создать черновик» → success view | done                                        |
| Top-bar cabinet nav, «Черновик сохранён» in bar | sidebar shell                     | skipped — cabinet shell is a separate task; |
|                                                 |                                   | save time shown in the form footer          |

### Acceptance

- [x] Step 1 matches the mockup's layout/content inside ADR-024 tokens.
- [x] First save creates one draft; later saves update it (`?ride=<id>`).
- [x] GPX upload failure keeps the draft and reports it.
- [x] Steps 2–4 reachable with back/next; non-wizard screens unchanged.
- [x] Unit + API + functional e2e green; screenshots checked.
