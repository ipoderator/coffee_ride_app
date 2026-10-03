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
- [x] CR-200 KI-087: avatar/cover/GPX/stop/route-point deletes ask in `ConfirmDialog`,
      not `window.confirm`; KI-082's misfiled status corrected; KI-088's baseline
      captured from CI (temporary draft PR) — done 2026-10-03. See `docs/changelog.md`.
- [x] CR-203 `project-state.md` cut to a ~100-line snapshot; old text verbatim in
      `project-state-archive.md`, invariants in `do-not-break.md`. See
      `docs/changelog.md`.
- [x] CR-204 `do-not-break.md` as a path-scoped rule loaded whole; area history via
      changelog grep in the read protocol. See `docs/changelog.md`.
