# Current task

## CR-154 — Global header to the discovery mockup

Status: **done, committed** (2026-09-28) together with CR-153 below.
Goal: owner asked «переделай шапку как на референсе» (screenshot = the mockup's
`.hdr`, `Discovery-Desktop.dc.html`: 72px raised bar, `padding 0 48px`, wordmark
24px, pill nav 44px/500/`surface` active, `.ib` theme 44px, ghost «Войти», filled
«Регистрация»; phone: 60px, wordmark 22px, theme + menu buttons).

Gap table:

| In mockup                                  | Was                                    | Done                                            |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------------- |
| Full-width raised bar 72/60px              | `bg`, 1200px-capped, `p-4`             | done                                            |
| Wordmark 24/22px                           | 28.8px                                 | done (`Wordmark` `className`)                   |
| Pills «Заезды / Мои заезды / Организатору» | «Заезды» link; cabinet menus signed-in | done (terms); signed-in keep dropdown + chevron |
| Theme icon button, no chevron              | `NavMenu` icon + chevron               | done; also in phone bar                         |
| Ghost «Войти», filled «Регистрация»        | text links with icons                  | done (`buttonClassName('primary')`)             |

Validation: see `docs/changelog.md` CR-154. Follow-up: KI-077.

## CR-153 — Discovery «Заезды» to the owner's mockup (variant B: frontend + API)

Status: **done, committed** (2026-09-28). Previous task CR-152 is done and recorded in
`docs/changelog.md`. Handoff with the gap table: `.claude/context/handoff-cr-153.md`.

Mockup: claude.ai/artifact/D9o9QsXikDVbMbDkDTsZxt → `project/Discovery-Desktop.dc.html`
(1440) and `project/Discovery-Mobile.dc.html` (390).

### Decision (owner, 2026-09-28)

Variant B from the handoff: everything frontend-only plus additive optional params on
`GET /v1/rides` and a `total`. Header nav (handoff question 3) is **not** in scope —
`AppHeader` stays as is.

### Requirements

API (additive, ADR-011 pagination unchanged):

- `GET /v1/rides` query: `startsFrom`/`startsTo` (ISO datetime with offset; lower
  bound never earlier than now), `paceMin`/`paceMax` (km/h; matches a ride whose
  pace groups include one in range, or — without groups — whose `paceKmh` is in
  range; same derivation as the cards), `difficulty` (1–5), `free` (`true` = price
  null/0, `false` = paid). Invalid ranges → 400 `validation_error`.
- Response: `total` (all rides matching the filters, cursor ignored); each item gains
  `waitlistCount` (count of `waiting` entries — already public on `GET /v1/rides/:id`).

Frontend (`features/participant/discovery`):

- Page head: `h1` + description, «Список / Карта» segments with icons on the right
  (full width on a phone).
- Filter chips row (both views): bicycle ▾, «Эта неделя», Темп ▾, Сложность ▾,
  «Бесплатные»; «N заездов» on the right; horizontal scroll on a phone.
- Featured card «Ближайший»: first ride with open registration (else the first ride),
  cover with the track + distance/start tag, date, title, «Старт: …», three big
  metrics, seats line + bar, «Подробнее и запись».
- «Все заезды» + «Сначала ближайшие» (count on a phone).
- Compact cards: metrics in one line, seats «4 из 10 · Запись закрыта / Мест нет · 2 в
  очереди / Осталось 15 мест» + bar, tags (bike, difficulty, groups, price).
- «Показать ещё N заездов» via `nextCursor` + `total`.

Not taken: header nav change, text under 12px, controls under 44/48px, colours outside
tokens, Unbounded below `h1`, «кофе у …» (stops not in the list payload).

### Acceptance criteria

- New params filter correctly (route tests), invalid ranges rejected, `total` and
  `waitlistCount` correct.
- Discovery renders featured + grid + load-more; filters drive the query; loading /
  empty / error states kept. Unit tests updated/added.
- typecheck/lint/tests green for api/web/ui/types; screenshots at 390/1440 checked.
- Docs: `docs/api.md`, `docs/design.md`, changelog, tasks, project-state.

### Progress

- [x] API + types + tests
- [x] terminology
- [x] frontend components + tests
- [x] validation + screenshots (see changelog CR-153)
- [x] docs/context

### Result

Implemented as specified; validation in `docs/changelog.md` → CR-153. Open:
KI-077 baselines after push; ride page at 320px overflowed by 31px in the
screenshot run (ride-detail untouched by this task — not investigated).
