# Current task — CR-189..CR-194: QA report for 13653ed (2026-10-02) — DONE (committed, pushed to `main`)

Source: the owner's QA report `QA_13653ed_2026-10-02.md` (checked against HEAD
`7d67990`, which is newer than the report — every item is re-checked before fixing).
Branch: `fix/qa-13653ed`. Split across parallel subagents in their own git worktrees,
by priority and complexity; the lead merges and updates docs/context at the end.

## Shared ground rules (every subagent)

- Never touch the user's processes on :3000/:4000/:6006 or the `.env` `DATABASE_URL`.
  E2E runs isolated: `E2E_WEB_PORT`/`E2E_API_PORT` (new in this task,
  `apps/web/playwright.config.ts`) + `DATABASE_URL` pointing at a disposable,
  migrated `coffee_ride_test_<id>` in the docker Postgres (127.0.0.1:5432).
- API tests only with `TEST_DATABASE_URL` = that disposable DB.
- Docs/context (`changelog`, `project-state`, `tasks`, `decisions`, `known-issues`)
  are written by the lead after merging; reserved: migration `0025` + ADR-029 for
  CR-190, ADR-030 for CR-193 if needed.

## Split

| CR     | Priority | Item                                                                                                                                                                                   | Owner             |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| CR-189 | P1       | 1. Finish control: «Не подтверждено»/results refresh without reload (+ test 1 → 0)                                                                                                     | subagent (sonnet) |
| CR-190 | P1       | 2. Reschedule a published ride before start (date/time, reason, confirm, all displays + ICS, notify registrants + waitlist)                                                            | subagent (opus)   |
| CR-191 | P1       | 3. `seed:demo --no-routes` `403 finish_not_confirmed` + re-run; 4. `pnpm lint` after clean install (`eslint-plugin-react-hooks`)                                                       | subagent (sonnet) |
| CR-192 | P2/P3    | 5. Explicit warning before publishing without a route; 6. zero-recipient update result; 9. overview hint (groups editable) + leave the «Новый заезд · шаг 4 из 4» wizard after publish | subagent (sonnet) |
| CR-193 | P2       | 7. `/me` «Предстоящие» without cancelled/finished; catalog separates unavailable rides, no «Осталось N мест» on them                                                                   | subagent (opus)   |
| CR-194 | P2       | 8. Russian validation errors (registration, organizer profile, related forms + API errors)                                                                                             | subagent (sonnet) |

Lead (done before the split): `E2E_WEB_PORT`/`E2E_API_PORT` in `playwright.config.ts`
and `e2e/helpers/{api-fixtures,ui}.ts` — verified `critical-journeys.spec.ts` 3/3 on
3199/4199 against `coffee_ride_test_qa_base`.

## Progress

- [x] CR-189 (255e1b1)
- [x] CR-190 (a1c5169, merged 375e766; ADR-029, changelog, tasks, api.md written with it)
- [x] CR-191 (8496267; changelog + tasks written with it)
- [x] CR-192 (c42c973, rebased on CR-190/191; changelog + tasks written with it)
- [x] CR-193 (b6e28db, merged a3af58d; changelog + tasks written with it)
- [x] CR-194 (26191a0, merged a4fa669; changelog + tasks written with it)
- [x] merge, full validation, docs/context (CR-189 changelog entry, project-state,
      architecture-map, KI-083 archived, coverage baseline raised + `packages/db` added)

## Validation (merged branch)

- `pnpm install --frozen-lockfile`; `turbo lint typecheck --force` 17/17 (`NODE_PATH` unset).
- `pnpm test:coverage` on `coffee_ride_test_final` + live Redis/S3: api 600, web 748,
  ui 246, maps-2gis 72 (+6 skipped), resilience 15, db 11 — all passed;
  `coverage:check` holds (ui had dropped under its floor — `archiveShow` test added).
- Storybook 175/175 (axe). E2E on 3199/4199: 44 passed; 12 = missing `-darwin`
  screenshot baselines only (by design; files deleted).

## Open

- Linux screenshot baselines (KI-084): Docker amd64 pull or CI artifact after push.
- QA P3: done in CR-195 (25c4d11, local on `main`, not pushed); KI-087 — the other
  `window.confirm` deletes.
