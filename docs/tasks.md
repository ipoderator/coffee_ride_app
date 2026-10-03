# Backlog

Persistent task list. `.claude/context/current-task.md` is the active task;
`.claude/context/project-state.md` → "Next" holds the prioritised next steps.

Every completed section as of CR-201 (CR-001..CR-201: foundation, auth, rides, route,
registration, communication, post-ride, quality, resilience, extensibility, security,
deployment, contract follow-ups) lives verbatim in `docs/tasks-archive.md` — grep it
by CR id, don't read it whole (the "Recently done" items below are in it too).

Rules: add an item as `- [ ] CR-XXX short goal` under "Open" when work is agreed;
on completion check it off and move it to "Recently done" with one line
(`— done YYYY-MM-DD. See docs/changelog.md`). Keep "Recently done" to ~8 items —
older ones go to the bottom of `docs/tasks-archive.md`.

## Open

None — see `project-state.md` → "Next" for candidate work awaiting the owner.

## Recently done

- [x] CR-194 QA `13653ed` item 8: Russian validation errors on every form — the review
      comment's missing line, «email» vs «почта» wording, per-form tests with the API's
      real English replies, and a guard test against English API/Zod text, native
      validation bubbles and untranslated schema issue codes. See `docs/changelog.md`.
- [x] CR-193 QA `13653ed` item 7: «Предстоящие» on `/me` and `/me/rides` without cancelled
      or finished rides (status-first split, «История» tab, cancellations still in sight
      on `/me`); the catalog's collapsed «Завершённые и отменённые» section
      (`GET /v1/rides?phase=`), no «Осталось N мест» unless registration is open. See
      `docs/changelog.md`.
- [x] CR-195 QA `13653ed` P3: ride cancellation confirmed in `ConfirmDialog` instead of
      `window.confirm`; the wizard's step 4 enters the start with step 1's `DatePicker` +
      time field; the queue place reads «№ N в очереди», not «#N». KI-087 tracks the
      remaining `window.confirm` deletes. See `docs/changelog.md`.
- [x] CR-196 QA `fe0b4c2`: `pnpm --filter db db:migrate` from a checkout under a
      Cyrillic path — the migrations folder via `fileURLToPath`, not a percent-encoded
      `URL.pathname`; regression test from a non-ASCII copy of `packages/db`. See
      `docs/changelog.md`.
- [x] CR-197 QA `fe0b4c2`: `next` survives register → verify email → «Перейти ко
      входу» → sign in (validated on every hop; external/unsafe targets dropped);
      full-journey e2e. KI-089: the emailed link still has no `next`. See
      `docs/changelog.md`.
- [x] CR-198 QA `fe0b4c2` P3: in «Перенести заезд» a new date re-judges the
      pair-dependent time error («текущее время»/«уже прошло») at once instead of on the
      next «Продолжить». See `docs/changelog.md`.
- [x] CR-199 Participant notifications show their time in the ride's timezone (was UTC
      — 13:01 vs the organizer journal's 16:01); additive `Notification.ride.startTimezone`.
      See `docs/changelog.md`.
- [x] CR-201 Claude Code harness: eight more project skills (`visual-baselines`,
      `close-task`, `qa-report-intake`, `ci-triage`, `storybook-check`, `known-issue`,
      `dependabot-triage`, `terminology-string`) and a skill routing table in
      `.claude/CLAUDE.md`. See `docs/changelog.md`.
- [x] CR-202 Token economy: context files cut to snapshots with verbatim archives,
      targeted-read protocol, path-scoped `.claude/rules`. See `docs/changelog.md`.
